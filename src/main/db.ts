/**
 * 호환성 래퍼
 * 기존 코드에서 '../db' 또는 './db'로 import하는 부분을 깨뜨리지 않기 위한 re-export입니다.
 * 새 코드는 './database' 모듈을 직접 import하세요.
 */

export { getDB, saveDB, initDB, resetDB } from './database/index'
