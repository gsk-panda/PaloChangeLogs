#!/usr/bin/env node
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { DOMParser } from '@xmldom/xmldom';
import { parse as parseUrl } from 'url';

const db = sqlite3.verbose();

const DB_PATH = process.env.DB_PATH || path.join('/app', 'data', 'palochangelogs.db');
const PROXY_URL = process.env.PROXY_URL || 'http://palochangelogs:3002/panorama-proxy';

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

const pollForJobResults = async (jobId) => {
    return new Promise((resolve, reject) => {
        const poll = () => {
            const url = `${PROXY_URL}/api/?type=log&action=get&job-id=${encodeURIComponent(jobId)}`;
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
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(data, 'text/xml');
                        const jobStatus = doc.getElementsByTagName('job')[0]?.getElementsByTagName('status')[0]?.textContent;
                        
                        if (jobStatus === 'FIN' || jobStatus === 'ACT') {
                            resolve(data);
                        } else {
                            setTimeout(poll, 1000);
                        }
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

const fetchChangeLogsRange = async (startDate, endDate) => {
    return new Promise((resolve, reject) => {
        const start = formatDateForPanorama(startDate);
        const end = formatDateForPanorama(endDate);
        const query = `(receive_time geq '${start} 00:00:00') and (receive_time leq '${end} 23:59:59')`;
        const params = `type=log&log-type=config&nlogs=500&query=${encodeURIComponent(query)}`;
        const url = `${PROXY_URL}/api/?${params}`;
        
        console.log(`Fetching logs from Panorama via proxy: ${startDate} to ${endDate}...`);
        
        const parsedUrl = parseUrl(url);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 3002,
            path: parsedUrl.path,
            method: 'GET'
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        console.error(`HTTP ${res.statusCode} response:`, data.substring(0, 500));
                        reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                        return;
                    }
                    
                    if (data.trim().length === 0) {
                        console.warn('Empty response from Panorama API');
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
                        console.error(`Panorama API error: ${msg}`);
                        reject(new Error(`Panorama API error: ${msg}`));
                        return;
                    }
                    
                    const jobNode = doc.getElementsByTagName('job')[0];
                    if (jobNode && !jobNode.getElementsByTagName('status')[0]) {
                        const jobId = jobNode.textContent?.trim();
                        if (jobId) {
                            console.log(`API returned job ID: ${jobId}, polling for results...`);
                            return pollForJobResults(jobId).then((jobData) => {
                                const jobDoc = parser.parseFromString(jobData, 'text/xml');
                                const entries = jobDoc.getElementsByTagName('entry');
                                console.log(`Found ${entries.length} entries in job results`);
                                const logs = parseEntries(entries);
                                console.log(`Parsed ${logs.length} valid logs`);
                                resolve(logs);
                            }).catch(reject);
                        }
                    }
                    
                    const entries = doc.getElementsByTagName('entry');
                    console.log(`Found ${entries.length} entries in response`);
                    const logs = parseEntries(entries);
                    console.log(`Parsed ${logs.length} valid logs`);
                    resolve(logs);
                } catch (err) {
                    console.error('Error parsing response:', err);
                    reject(err);
                }
            });
        });
        
        req.on('error', (err) => {
            console.error('Request error:', err);
            reject(err);
        });
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
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

const syncYesterdayLogs = async () => {
    const db = initDatabase();
    
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
            
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            
            const year = yesterday.getFullYear();
            const month = String(yesterday.getMonth() + 1).padStart(2, '0');
            const day = String(yesterday.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            console.log(`Syncing logs for ${dateStr}...`);
            
            fetchChangeLogsRange(dateStr, dateStr).then(async (logs) => {
                const logsWithDescription = logs.filter(log => log.description && log.description.trim().length > 0);
                console.log(`Fetched ${logsWithDescription.length} logs, getting full details...`);
                
                const stmt = db.prepare(`INSERT OR REPLACE INTO change_logs 
                    (seqno, timestamp, admin, device_group, type, action, description, status, diff_before, diff_after, log_date, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
                
                let completed = 0;
                const total = logsWithDescription.length;
                
                if (total === 0) {
                    db.close();
                    resolve();
                    return;
                }
                
                for (const log of logsWithDescription) {
                    try {
                        const details = await fetchLogDetail(log.seqno);
                        
                        const receiveTime = details.receiveTime || log.timestamp;
                        const path = details.path || log.description;
                        let cmd = details.cmd || log.action;
                        const admin = details.admin || log.admin;
                        let before = details.before || '';
                        let after = details.after || '';
                        
                        const cmdLower = cmd.toLowerCase();
                        cmd = cmdLower === 'delete' ? 'Delete' : cmdLower === 'set' ? 'Set' : cmdLower === 'add' ? 'Add' : cmdLower === 'clone' ? 'Clone' : cmdLower === 'multi-clone' ? 'Multi-Clone' : 'Edit';
                        
                        const beforeTrimmed = before.trim();
                        const afterTrimmed = after.trim();
                        const noPreviousState = beforeTrimmed === 'No previous configuration state.';
                        const noNewState = afterTrimmed === 'No new configuration state.';
                        const sameContent = beforeTrimmed === afterTrimmed && beforeTrimmed.length > 0;
                        
                        if ((noPreviousState && noNewState) || sameContent) {
                            console.log(`  Skipping seqno ${log.seqno} - no meaningful change (before: "${beforeTrimmed.substring(0, 50)}...", after: "${afterTrimmed.substring(0, 50)}...")`);
                            completed++;
                            if (completed === total) {
                                stmt.finalize();
                                db.close();
                                console.log(`Successfully synced ${total} logs for ${dateStr}`);
                                resolve();
                            }
                            continue;
                        }
                        
                        let logDate = dateStr;
                        if (receiveTime) {
                            const dateMatch = receiveTime.match(/^(\d{4}\/\d{2}\/\d{2})/);
                            if (dateMatch) {
                                logDate = dateMatch[1].replace(/\//g, '-');
                            } else {
                                const dateMatch2 = receiveTime.match(/^(\d{4}-\d{2}-\d{2})/);
                                if (dateMatch2) {
                                    logDate = dateMatch2[1];
                                }
                            }
                        }
                        
                        console.log(`  Storing seqno ${log.seqno} with log_date=${logDate}, action=${cmd}`);
                        
                        stmt.run(
                            log.seqno,
                            receiveTime,
                            admin,
                            log.deviceGroup,
                            log.type,
                            cmd,
                            path,
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
                                    db.close();
                                    console.log(`Successfully synced ${total} logs for ${dateStr}`);
                                    resolve();
                                }
                            }
                        );
                    } catch (err) {
                        console.warn(`Failed to fetch details for seqno ${log.seqno}:`, err);
                        completed++;
                        if (completed === total) {
                            stmt.finalize();
                            db.close();
                            resolve();
                        }
                    }
                }
            }).catch((err) => {
                db.close();
                reject(err);
            });
        });
    });
};

async function main() {
  try {
    console.log('Starting daily log sync...');
    await syncYesterdayLogs();
    console.log('Daily log sync completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Daily log sync failed:', error);
    process.exit(1);
  }
}

main();
