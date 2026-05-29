import * as fs from 'fs';
import * as path from 'path';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const appData = process.env.APPDATA 
    || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library/Application Support') : path.join(process.env.HOME || '', '.config'));
  const dbPath = path.join(appData, 'capstone-agent', 'capstone-agent.db');
  
  if (!fs.existsSync(dbPath)) {
    console.error('DB not found:', dbPath);
    return;
  }
  
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  console.log("=== Document Sources ===");
  const files = db.exec('SELECT id, file_name, file_type FROM document_sources LIMIT 10');
  if (files.length > 0) {
    console.table(files[0].values);
  }
  
  console.log("\n=== Document Chunks (Samples) ===");
  const chunks = db.exec('SELECT c.document_id, d.file_name, substr(c.content, 1, 100) as content_preview FROM document_chunks c JOIN document_sources d ON c.document_id = d.id LIMIT 10');
  if (chunks.length > 0) {
    console.table(chunks[0].values);
  }
}

main().catch(console.error);
