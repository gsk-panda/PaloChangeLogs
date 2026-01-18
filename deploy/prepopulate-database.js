#!/usr/bin/env node
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { DOMParser } from '@xmldom/xmldom';
import { parse as parseUrl } from 'url';

const db = sqlite3.verbose();

const DB_PATH = path.join('/opt/PaloChangeLogs', 'data', 'palochangelogs.db');
const PROXY_URL = 'http://localhost:3002/panorama-proxy';

const DAYS_TO_PREPOPULATE = 720;
const BATCH_SIZE_DAYS = 30;

const parseEntries = (entries) => {
    const logs = [];
    
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const seqno = entry.getElementsByTagName('seqno')[0]?.textContent || '';
        const timestamp = entry.getElementsByTagName('receive_time')[0]?.textContent || '';
        const admin = entry.getElementsByTagName('admin')[0]?.textContent || 'system';
        const path = entry.getElementsByTagName('path')[0]?.textContent || '';
        const cmd = entry.getElementsByTagName('cmd')[0]?.textContent || 'unknown';
        
        if (!seqno || !path) continue;
        
        const cmdLower = cmd.toLowerCase();
        const action = cmdLower === 'delete' ? 'Delete' : cmdLower === 'set' ? 'Set' : cmdLower === 'add' ? 'Add' : cmdLower === 'clone' ? 'Clone' : cmdLower === 'multi-clone' ? 'Multi-Clone' : 'Edit';
        
        logs.push({
            seqno,
            timestamp,
            admin,
            description: path,
            action: action,
            type: path.includes('policy') ? 'Security Policy' : path.includes('address') || path.includes('object') ? 'Address Object' : path.includes('network') || path.includes('interface') ? 'Network Interface' : 'System Config',
            deviceGroup: 'Global',
            status: 'Success',
            diffBefore: entry.getElementsByTagName('before-change-detail')[0]?.textContent || '',
            diffAfter: entry.getElementsByTagName('after-change-detail')[0]?.textContent || ''
        });
    }
    
    return logs;
};

const pollForJobResults = async (jobId) => {
    return new Promise((resolve, reject) => {
        const pollUrl = `${PROXY_URL}/api/?type=log&action=get&job-id=${encodeURIComponent(jobId)}`;
        const parsedUrl = parseUrl(pollUrl);
        
        let attempts = 0;
        const maxAttempts = 60;
        
        const poll = () => {
            attempts++;
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 3002,
                path: parsedUrl.path,
                method: 'GET'
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            reject(new Error(`HTTP ${res.statusCode} while polling job ${jobId}`));
                            return;
                        }
                        
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(data, 'text/xml');
                        
                        const respStatus = doc.documentElement.getAttribute('status');
                        if (respStatus === 'error') {
                            const msg = doc.getElementsByTagName('msg')[0]?.textContent || 'Unknown job error';
                            reject(new Error(`Job failed: ${msg}`));
                            return;
                        }
                        
                        const jobNode = doc.getElementsByTagName('job')[0];
                        if (jobNode) {
                            const jobStatus = jobNode.getElementsByTagName('status')[0]?.textContent;
                            
                            if (jobStatus === 'FIN' || jobStatus === 'COMPLETE') {
                                console.log(`  Job ${jobId} completed (status: ${jobStatus})`);
                                resolve(data);
                                return;
                            }
                            
                            if (jobStatus === 'ACT') {
                                if (attempts >= maxAttempts) {
                                    reject(new Error(`Timeout waiting for job ${jobId} to complete`));
                                    return;
                                }
                                setTimeout(poll, 1000);
                                return;
                            }
                        }
                        
                        if (doc.getElementsByTagName('entry').length > 0 || doc.getElementsByTagName('log').length > 0) {
                            console.log(`  Job ${jobId} returned data`);
                            resolve(data);
                            return;
                        }
                        
                        if (attempts >= maxAttempts) {
                            reject(new Error(`Timeout waiting for job ${jobId} to complete`));
                            return;
                        }
                        
                        setTimeout(poll, 1000);
                    } catch (err) {
                        reject(err);
                    }
                });
            });
            
            req.on('error', reject);
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            req.end();
        };
        
        poll();
    });
};

const initDatabase = () => {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    return new db.Database(DB_PATH);
};

const formatDateForPanorama = (dateStr) => {
    const parts = dateStr.split(/[-\/]/);
    if (parts.length === 3) {
        let year, month, day;
        if (parts[0].length === 4) {
            [year, month, day] = parts;
        } else {
            [month, day, year] = parts;
        }
        return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
    }
    return dateStr.replace(/-/g, '/');
};

const addDaysToDate = (dateStr, days) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    const newDay = String(date.getDate()).padStart(2, '0');
    return `${newYear}-${newMonth}-${newDay}`;
};

const fetchChangeLogsRange = async (startDate, endDate) => {
    return new Promise((resolve, reject) => {
        const start = formatDateForPanorama(startDate);
        const end = formatDateForPanorama(endDate);
        const query = `(receive_time geq '${start} 00:00:00') and (receive_time leq '${end} 23:59:59')`;
        const params = `type=log&log-type=config&nlogs=500&query=${encodeURIComponent(query)}`;
        const url = `${PROXY_URL}/api/?${params}`;
        
        console.log(`  Fetching from Panorama via proxy: ${startDate} to ${endDate}...`);
        
        const parsedUrl = parseUrl(url);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 3002,
            path: parsedUrl.path,
            method: 'GET'
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        console.error(`  HTTP ${res.statusCode} response:`, data.substring(0, 500));
                        reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                        return;
                    }
                    
                    if (data.trim().length === 0) {
                        console.warn(`  Empty response from Panorama API`);
                        resolve([]);
                        return;
                    }
                    
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(data, 'text/xml');
                    
                    const status = doc.documentElement.getAttribute('status');
                    if (status === 'error') {
                        const msg = doc.getElementsByTagName('msg')[0]?.textContent || 
                                   doc.getElementsByTagName('result')[0]?.getElementsByTagName('msg')[0]?.textContent ||
                                   'Unknown error';
                        console.error(`  Panorama API error: ${msg}`);
                        reject(new Error(`Panorama API error: ${msg}`));
                        return;
                    }
                    
                    const jobNode = doc.getElementsByTagName('job')[0];
                    if (jobNode && !jobNode.getElementsByTagName('status')[0]) {
                        const jobId = jobNode.textContent?.trim();
                        if (jobId) {
                            console.log(`  API returned job ID: ${jobId}, polling for results...`);
                            return pollForJobResults(jobId).then((jobData) => {
                                const jobDoc = parser.parseFromString(jobData, 'text/xml');
                                const entries = jobDoc.getElementsByTagName('entry');
                                console.log(`  Found ${entries.length} entries in job results`);
                                const logs = parseEntries(entries);
                                console.log(`  Parsed ${logs.length} valid logs`);
                                resolve(logs);
                            }).catch(reject);
                        }
                    }
                    
                    const entries = doc.getElementsByTagName('entry');
                    console.log(`  Found ${entries.length} entries in response`);
                    const logs = parseEntries(entries);
                    
                    for (let i = 0; i < entries.length; i++) {
                        const entry = entries[i];
                        const seqno = entry.getElementsByTagName('seqno')[0]?.textContent || '';
                        const timestamp = entry.getElementsByTagName('receive_time')[0]?.textContent || '';
                        const admin = entry.getElementsByTagName('admin')[0]?.textContent || 'system';
                        const path = entry.getElementsByTagName('path')[0]?.textContent || '';
                        const cmd = entry.getElementsByTagName('cmd')[0]?.textContent || 'unknown';
                        
                        if (seqno && path) {
                            logs.push({
                                seqno,
                                timestamp,
                                admin,
                                description: path,
                                action: cmd === 'add' ? 'Add' : cmd === 'delete' ? 'Delete' : 'Edit',
                                type: path.includes('policy') ? 'Security Policy' : path.includes('address') || path.includes('object') ? 'Address Object' : path.includes('network') || path.includes('interface') ? 'Network Interface' : 'System Config',
                                deviceGroup: 'Global',
                                status: 'Success',
                                diffBefore: entry.getElementsByTagName('before-change-detail')[0]?.textContent || '',
                                diffAfter: entry.getElementsByTagName('after-change-detail')[0]?.textContent || ''
                            });
                        }
                    }
                    
                    console.log(`  Parsed ${logs.length} valid logs`);
                    resolve(logs);
                } catch (err) {
                    console.error(`  Error parsing response:`, err.message);
                    console.error(`  Response preview: ${data.substring(0, 500)}`);
                    reject(err);
                }
            });
        });
        
        req.on('error', (err) => {
            console.error(`  Request error:`, err.message);
            reject(err);
        });
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
};

const fetchAllChangeLogsRange = async (startDate, endDate) => {
    const allLogs = [];
    let offset = 0;
    let hasMore = true;
    const batchSize = 500;
    let batchNumber = 1;
    
    while (hasMore) {
        try {
            console.log(`  Fetching batch ${batchNumber}...`);
            const batch = await fetchChangeLogsRange(startDate, endDate);
            console.log(`  Batch ${batchNumber}: ${batch.length} logs`);
            
            if (batch.length === 0) {
                hasMore = false;
            } else {
                allLogs.push(...batch);
                if (batch.length < batchSize) {
                    hasMore = false;
                } else {
                    offset += batchSize;
                    batchNumber++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (err) {
            console.error(`  Error fetching batch ${batchNumber} at offset ${offset}:`, err.message);
            hasMore = false;
        }
    }
    
    console.log(`  Total logs fetched: ${allLogs.length}`);
    return allLogs;
};

const fetchLogDetail = async (seqno) => {
    return new Promise((resolve, reject) => {
        const query = `(seqno eq ${seqno})`;
        const params = `type=log&log-type=config&show-detail=yes&query=${encodeURIComponent(query)}&uniq=yes&dir=backward&nlogs=1`;
        const url = `${PROXY_URL}/api/?${params}`;
        
        console.log(`  Fetching detail for seqno ${seqno}...`);
        
        const parsedUrl = parseUrl(url);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 3002,
            path: parsedUrl.path,
            method: 'GET'
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        console.error(`  HTTP ${res.statusCode} response for seqno ${seqno}`);
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }
                    
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(data, 'text/xml');
                    
                    const status = doc.documentElement.getAttribute('status');
                    if (status === 'error') {
                        const msg = doc.getElementsByTagName('msg')[0]?.textContent || 'Unknown error';
                        console.error(`  Panorama API error for seqno ${seqno}:`, msg);
                        reject(new Error(`Panorama API error: ${msg}`));
                        return;
                    }
                    
                    const jobNode = doc.getElementsByTagName('job')[0];
                    if (jobNode && !jobNode.getElementsByTagName('status')[0]) {
                        const jobId = jobNode.textContent?.trim();
                        if (jobId) {
                            console.log(`  API returned job ID ${jobId} for seqno ${seqno}, polling...`);
                            return pollForJobResults(jobId).then((jobData) => {
                                const jobDoc = parser.parseFromString(jobData, 'text/xml');
                                let entry = jobDoc.getElementsByTagName('entry')[0];
                                
                                if (!entry) {
                                    const logSection = jobDoc.getElementsByTagName('log')[0];
                                    if (logSection) {
                                        const logsSection = logSection.getElementsByTagName('logs')[0];
                                        if (logsSection) {
                                            entry = logsSection.getElementsByTagName('entry')[0];
                                        }
                                    }
                                }
                                
                                if (entry) {
                                    const before = entry.getElementsByTagName('before-change-detail')[0]?.textContent || '';
                                    const after = entry.getElementsByTagName('after-change-detail')[0]?.textContent || '';
                                    const receiveTime = entry.getElementsByTagName('receive_time')[0]?.textContent || '';
                                    const path = entry.getElementsByTagName('path')[0]?.textContent || '';
                                    const cmd = entry.getElementsByTagName('cmd')[0]?.textContent || '';
                                    const admin = entry.getElementsByTagName('admin')[0]?.textContent || '';
                                    
                                    console.log(`  Fetched details for seqno ${seqno}: before=${before.length} chars, after=${after.length} chars`);
                                    resolve({ 
                                        before, 
                                        after,
                                        receiveTime,
                                        path,
                                        cmd,
                                        admin
                                    });
                                } else {
                                    console.warn(`  No entry found in job results for seqno ${seqno}`);
                                    resolve({ before: '', after: '', receiveTime: '', path: '', cmd: '', admin: '' });
                                }
                            }).catch(reject);
                        }
                    }
                    
                    let entry = doc.getElementsByTagName('entry')[0];
                    
                    if (!entry) {
                        const logSection = doc.getElementsByTagName('log')[0];
                        if (logSection) {
                            const logsSection = logSection.getElementsByTagName('logs')[0];
                            if (logsSection) {
                                entry = logsSection.getElementsByTagName('entry')[0];
                            }
                        }
                    }
                    
                    if (entry) {
                        const before = entry.getElementsByTagName('before-change-detail')[0]?.textContent || '';
                        const after = entry.getElementsByTagName('after-change-detail')[0]?.textContent || '';
                        const receiveTime = entry.getElementsByTagName('receive_time')[0]?.textContent || '';
                        const path = entry.getElementsByTagName('path')[0]?.textContent || '';
                        const cmd = entry.getElementsByTagName('cmd')[0]?.textContent || '';
                        const admin = entry.getElementsByTagName('admin')[0]?.textContent || '';
                        
                        console.log(`  Fetched details for seqno ${seqno}: before=${before.length} chars, after=${after.length} chars`);
                        resolve({ before, after, receiveTime, path, cmd, admin });
                    } else {
                        console.warn(`  No entry found in response for seqno ${seqno}`);
                        resolve({ before: '', after: '', receiveTime: '', path: '', cmd: '', admin: '' });
                    }
                } catch (err) {
                    console.error(`  Error parsing response for seqno ${seqno}:`, err);
                    reject(err);
                }
            });
        });
        
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
};

const storeChangeLogs = (db, logs) => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS change_logs (
                seqno TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                admin TEXT,
                device_group TEXT,
                type TEXT,
                action TEXT,
                description TEXT,
                status TEXT,
                diff_before TEXT,
                diff_after TEXT,
                log_date TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run(`CREATE INDEX IF NOT EXISTS idx_log_date ON change_logs(log_date)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON change_logs(timestamp)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_description ON change_logs(description)`);
            
            const stmt = db.prepare(`INSERT OR REPLACE INTO change_logs 
                (seqno, timestamp, admin, device_group, type, action, description, status, diff_before, diff_after, log_date, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
            
            let completed = 0;
            const total = logs.length;
            
            if (total === 0) {
                stmt.finalize();
                resolve();
                return;
            }
            
            logs.forEach((log) => {
                const before = (log.diffBefore || '').trim();
                const after = (log.diffAfter || '').trim();
                const noPreviousState = before === 'No previous configuration state.';
                const noNewState = after === 'No new configuration state.';
                const sameContent = before === after && before.length > 0;
                
                if ((noPreviousState && noNewState) || sameContent) {
                    console.log(`  Skipping seqno ${log.seqno} - no meaningful change (before: "${before.substring(0, 50)}...", after: "${after.substring(0, 50)}...")`);
                    completed++;
                    if (completed === total) {
                        stmt.finalize();
                        resolve();
                    }
                    return;
                }
                
                let logDate = log.timestamp.split(' ')[0] || log.timestamp.split('T')[0];
                if (logDate.includes('/')) {
                    logDate = logDate.replace(/\//g, '-');
                }
                
                const actionLower = (log.action || '').toLowerCase();
                const action = actionLower === 'delete' ? 'Delete' : actionLower === 'set' ? 'Set' : actionLower === 'add' ? 'Add' : actionLower === 'clone' ? 'Clone' : actionLower === 'multi-clone' ? 'Multi-Clone' : 'Edit';
                
                stmt.run(
                    log.seqno,
                    log.timestamp,
                    log.admin,
                    log.deviceGroup,
                    log.type,
                    action,
                    log.description,
                    log.status,
                    before,
                    after,
                    logDate,
                    (err) => {
                        if (err) {
                            console.error(`Error storing log ${log.seqno}:`, err);
                        }
                        completed++;
                        if (completed === total) {
                            stmt.finalize();
                            resolve();
                        }
                    }
                );
            });
        });
    });
};

const processDateRange = async (db, startDate, endDate) => {
    console.log(`\nProcessing date range: ${startDate} to ${endDate}`);
    console.log('Fetching all logs...');
    
    const fetchedLogs = await fetchAllChangeLogsRange(startDate, endDate);
    const logsWithDescription = fetchedLogs.filter(log => 
        log.description && log.description.trim().length > 0
    );
    
    console.log(`Found ${logsWithDescription.length} logs with descriptions`);
    console.log('Fetching full change details (show-detail=yes) for each log...');
    
    const logsWithFullDetails = [];
    let processed = 0;
    
    for (const log of logsWithDescription) {
        try {
            process.stdout.write(`\rProcessing ${processed + 1}/${logsWithDescription.length} (seqno: ${log.seqno})...`);
            
            const details = await fetchLogDetail(log.seqno);
            
            const receiveTime = details.receiveTime || log.timestamp;
            const path = details.path || log.description;
            const cmd = details.cmd || log.action;
            const admin = details.admin || log.admin;
            const before = details.before || '';
            const after = details.after || '';
            
            logsWithFullDetails.push({
                ...log,
                timestamp: receiveTime,
                description: path,
                action: cmd,
                admin: admin,
                diffBefore: before,
                diffAfter: after,
            });
            
            processed++;
            
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
            console.warn(`\nFailed to fetch details for seqno ${log.seqno}:`, err.message);
            logsWithFullDetails.push(log);
            processed++;
        }
    }
    
    console.log(`\nStoring ${logsWithFullDetails.length} logs in database...`);
    await storeChangeLogs(db, logsWithFullDetails);
    console.log(`✓ Successfully stored ${logsWithFullDetails.length} logs for ${startDate} to ${endDate}`);
    
    return logsWithFullDetails.length;
};

async function main() {
    try {
        console.log('========================================');
        console.log('PaloChangeLogs Database Prepopulation');
        console.log('========================================');
        console.log(`Prepopulating database with last ${DAYS_TO_PREPOPULATE} days of configuration changes`);
        console.log(`Processing in batches of ${BATCH_SIZE_DAYS} days`);
        console.log('');
        
        const db = initDatabase();
        
        const today = new Date();
        const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const overallStartDate = addDaysToDate(endDate, -DAYS_TO_PREPOPULATE);
        
        console.log(`Overall date range: ${overallStartDate} to ${endDate}`);
        console.log(`Total batches: ${Math.ceil(DAYS_TO_PREPOPULATE / BATCH_SIZE_DAYS)}`);
        console.log('');
        
        let totalStored = 0;
        let currentEndDate = endDate;
        let batchNumber = 1;
        const totalBatches = Math.ceil(DAYS_TO_PREPOPULATE / BATCH_SIZE_DAYS);
        
        while (true) {
            let batchStartDate = addDaysToDate(currentEndDate, -BATCH_SIZE_DAYS + 1);
            
            if (batchStartDate < overallStartDate) {
                batchStartDate = overallStartDate;
            }
            
            console.log(`\n========================================`);
            console.log(`Batch ${batchNumber}/${totalBatches}: ${batchStartDate} to ${currentEndDate}`);
            console.log('========================================');
            const batchStored = await processDateRange(db, batchStartDate, currentEndDate);
            totalStored += batchStored;
            console.log(`✓ Batch ${batchNumber} complete: ${batchStored} logs stored`);
            
            if (batchStartDate <= overallStartDate) {
                break;
            }
            
            currentEndDate = addDaysToDate(batchStartDate, -1);
            batchNumber++;
        }
        
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('');
                console.log('========================================');
                console.log('Prepopulation Complete!');
                console.log('========================================');
                console.log(`Total logs stored: ${totalStored}`);
                console.log(`Total batches processed: ${batchNumber}`);
                console.log(`Database location: ${DB_PATH}`);
                console.log('');
                process.exit(0);
            }
        });
    } catch (error) {
        console.error('\nPrepopulation failed:', error);
        process.exit(1);
    }
}

main();
