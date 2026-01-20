import http from 'http';
import https from 'https';
import fs from 'fs';
import { parse as parseUrl } from 'url';
import sqlite3 from 'sqlite3';
import path from 'path';

const sqlite3Module = sqlite3.verbose();

let PANORAMA_API_KEY;
try {
    PANORAMA_API_KEY = fs.readFileSync('/app/config/panorama-api-key', 'utf8').trim();
    if (!PANORAMA_API_KEY) {
        console.error('ERROR: Panorama API key is empty!');
        process.exit(1);
    }
    const keyPreview = PANORAMA_API_KEY.length > 10 
        ? `${PANORAMA_API_KEY.substring(0, 10)}...${PANORAMA_API_KEY.substring(PANORAMA_API_KEY.length - 10)}`
        : '***';
    console.log(`Panorama API key loaded successfully (${PANORAMA_API_KEY.length} chars, preview: ${keyPreview})`);
} catch (err) {
    console.error('ERROR: Failed to read Panorama API key:', err.message);
    process.exit(1);
}

const PANORAMA_CONFIG = fs.readFileSync('/app/config/panorama-config', 'utf8');
const PANORAMA_URL = PANORAMA_CONFIG.split('=')[1].trim();
const PANORAMA_HOST = parseUrl(PANORAMA_URL).hostname;
const PANORAMA_PORT = parseUrl(PANORAMA_URL).port || (parseUrl(PANORAMA_URL).protocol === 'https:' ? 443 : 80);
const USE_HTTPS = parseUrl(PANORAMA_URL).protocol === 'https:';

const PORT = 3002;
const DB_PATH = path.join('/app', 'data', 'palochangelogs.db');

let db = null;

const initDatabase = () => {
    if (db) return db;
    
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const Database = sqlite3Module.Database;
    db = new Database(DB_PATH, (err) => {
        if (err) {
            console.error('Error opening database:', err);
            return;
        }
        
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
        });
    });
    
    return db;
};

const ensureDatabaseReady = (callback) => {
    if (!db) {
        initDatabase();
    }
    
    if (db) {
        db.get('SELECT 1', (err) => {
            if (err && err.message.includes('SQLITE_MISUSE')) {
                setTimeout(() => ensureDatabaseReady(callback), 100);
            } else {
                callback();
            }
        });
    } else {
        setTimeout(() => ensureDatabaseReady(callback), 100);
    }
};

const handleDatabaseSearch = (req, res, query) => {
    ensureDatabaseReady(() => {
        if (!db) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Database not initialized' }));
            return;
        }
        
        const searchTerm = query.query || '';
        const startDate = query.startDate;
        const endDate = query.endDate;
        
        console.log(`[DB Search] Query: "${searchTerm}", Date range: ${startDate || 'N/A'} to ${endDate || 'N/A'}`);
        
        let sql = `SELECT * FROM change_logs WHERE LOWER(after_change_detail) LIKE ? ESCAPE '\\\\'`;
        const params = [`%${searchTerm.toLowerCase()}%`];
        
        if (startDate) {
            sql += ` AND log_date >= ?`;
            params.push(startDate);
        }
        
        if (endDate) {
            sql += ` AND log_date <= ?`;
            params.push(endDate);
        }
        
        sql += ` ORDER BY timestamp DESC LIMIT 1000`;
        
        console.log(`[DB Search] SQL: ${sql}`);
        console.log(`[DB Search] Params:`, params);
        
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('[DB Search] Error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            
            console.log(`[DB Search] Found ${rows.length} rows`);
            
            const logs = rows.map(row => ({
                id: `db-${row.seqno}`,
                seqno: row.seqno,
                timestamp: row.timestamp,
                admin: row.admin,
                description: row.description,
                action: row.action,
                type: row.type,
                deviceGroup: row.device_group,
                status: row.status,
                diffBefore: row.diff_before,
                diffAfter: row.diff_after
            }));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ logs }));
        });
    });
};

const handleDatabaseLogs = (req, res, query) => {
    ensureDatabaseReady(() => {
        if (!db) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Database not initialized' }));
            return;
        }
        
        const startDate = query.startDate;
        const endDate = query.endDate;
        
        if (!startDate || !endDate) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'startDate and endDate are required' }));
            return;
        }
        
        const sql = `SELECT * FROM change_logs WHERE log_date >= ? AND log_date <= ? ORDER BY timestamp DESC`;
        
        db.all(sql, [startDate, endDate], (err, rows) => {
            if (err) {
                console.error('[DB Logs] Error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            
            const logs = rows.map(row => ({
                id: `db-${row.seqno}`,
                seqno: row.seqno,
                timestamp: row.timestamp,
                admin: row.admin,
                description: row.description,
                action: row.action,
                type: row.type,
                deviceGroup: row.device_group,
                status: row.status,
                diffBefore: row.diff_before,
                diffAfter: row.diff_after
            }));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ logs }));
        });
    });
};

const handleDatabaseStats = (req, res) => {
    ensureDatabaseReady(() => {
        if (!db) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Database not initialized' }));
            return;
        }
        
        db.get(`SELECT COUNT(*) as total, MIN(log_date) as min_date, MAX(log_date) as max_date FROM change_logs`, (err, row) => {
            if (err) {
                console.error('[Stats] Error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                totalRows: row.total || 0,
                dateRange: row.min_date && row.max_date ? {
                    min: row.min_date,
                    max: row.max_date
                } : null
            }));
        });
    });
};

const server = http.createServer((req, res) => {
    const parsedUrl = parseUrl(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (pathname === '/panorama-proxy/api/db/search') {
        handleDatabaseSearch(req, res, query);
        return;
    }
    
    if (pathname === '/panorama-proxy/api/db/logs') {
        handleDatabaseLogs(req, res, query);
        return;
    }
    
    if (pathname === '/panorama-proxy/api/db/stats') {
        handleDatabaseStats(req, res);
        return;
    }
    
    if (pathname.startsWith('/panorama-proxy/api/')) {
        let queryString = parsedUrl.query ? new URLSearchParams(parsedUrl.query).toString() : '';
        queryString = queryString.replace(/[?&]key=[^&]*/g, '').replace(/^(\?|&)/, '?');
        if (queryString && !queryString.startsWith('?')) {
            queryString = '?' + queryString;
        }
        queryString += (queryString ? '&' : '?') + `key=${encodeURIComponent(PANORAMA_API_KEY)}`;
        
        const targetPath = pathname.replace('/panorama-proxy', '') + queryString;
        const options = {
            hostname: PANORAMA_HOST,
            port: PANORAMA_PORT,
            path: targetPath,
            method: req.method,
            headers: {
                ...req.headers,
                host: PANORAMA_HOST
            }
        };
        
        const client = USE_HTTPS ? https : http;
        const proxyReq = client.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });
        
        proxyReq.on('error', (err) => {
            console.error('Proxy error:', err);
            res.writeHead(500);
            res.end('Proxy error: ' + err.message);
        });
        
        req.pipe(proxyReq);
        return;
    }
    
    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`Panorama API proxy server running on port ${PORT}`);
    initDatabase();
});

process.on('SIGTERM', () => {
    if (db) {
        db.close();
    }
    server.close(() => {
        process.exit(0);
    });
});
