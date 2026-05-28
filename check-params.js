const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dbPath = path.join(process.env.APPDATA, 'capstone-agent', 'capstone-agent.db');

async function checkParams() {
  if (!fs.existsSync(dbPath)) {
    console.log('DB 파일을 찾을 수 없습니다: ' + dbPath);
    return;
  }
  
  const fileBuffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fileBuffer);
  
  try {
    const res = db.exec('SELECT * FROM user_chunking_params');
    if (res.length === 0) {
      console.log('현재 학습된 파라미터가 없습니다. (기본값 사용 중)');
    } else {
      console.log('=== 학습된 파라미터 현황 (user_chunking_params) ===');
      const columns = res[0].columns;
      res[0].values.forEach(row => {
        let obj = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        console.log(`질문 유형 [${obj.question_type}]: Top-K = ${obj.top_k}, MaxContextChars = ${obj.max_context_chars}, Overlap = ${obj.overlap}`);
      });
    }

    const feedbacks = db.exec('SELECT * FROM evidence_feedback ORDER BY created_at DESC LIMIT 5');
    console.log('\n=== 최근 남기신 피드백 로그 5건 ===');
    if (feedbacks.length > 0) {
      const fbCols = feedbacks[0].columns;
      feedbacks[0].values.forEach(row => {
        let obj = {};
        fbCols.forEach((col, i) => {
          obj[col] = row[i];
        });
        console.log(`- 질문유형: ${obj.question_type}, 피드백: ${obj.feedback}, 시간: ${obj.created_at}`);
      });
    } else {
      console.log('저장된 피드백이 없습니다.');
    }
  } catch (e) {
    console.error('DB 조회 에러:', e);
  }
}

checkParams();
