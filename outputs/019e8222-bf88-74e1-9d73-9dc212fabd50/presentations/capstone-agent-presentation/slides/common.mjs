const C = {
  ink: "#172026",
  muted: "#5E6B73",
  soft: "#F6F7F4",
  panel: "#FFFFFF",
  line: "#DDE3DE",
  teal: "#0F766E",
  mint: "#DDF4EF",
  coral: "#E76F51",
  amber: "#F2C14E",
  olive: "#6C8E3F",
  code: "#263238"
};

const slides = [
  {
    kind: "title",
    kicker: "캡스톤종합프로젝트",
    title: "Capstone Agent",
    subtitle: "선택형 데이터 소스와 분석 도구를 결합한 데스크톱 AI 에이전트",
    footer: "GitHub c1 @ 35b29fb · Electron + React + TypeScript + sql.js"
  },
  {
    kind: "problem",
    title: "프로젝트 상태 질문은 여러 기록을 동시에 봐야 답할 수 있다",
    points: [
      ["Git", "진행 내역은 커밋 로그와 브랜치에 남지만 자연어 질문으로 바로 쓰기 어렵다."],
      ["Meeting", "결정사항과 할 일은 회의록에 흩어져 있고 후속 추적이 약하다."],
      ["Task", "상태/담당자/마감일은 구조화되어도 근거 연결이 필요하다."],
      ["Document", "로컬 문서는 검색과 근거 제시가 없으면 답변 신뢰도가 떨어진다."]
    ],
    claim: "핵심 문제: 답변 자체보다 답변에 사용된 근거를 함께 보여주는 흐름이 필요하다."
  },
  {
    kind: "solution",
    title: "해결 방향은 Data Source + Tool + Prompt 조합 UI",
    subtitle: "사용자는 Dashboard에서 필요한 데이터와 분석 방식을 선택하고 질문한다.",
    chips: ["Git Repository", "Meeting Notes", "Tasks", "Local Documents"],
    tools: ["Git Progress Analyzer", "Meeting Summarizer", "Task Status Query", "Document Search", "Cross-source Report", "Report Generator"]
  },
  {
    kind: "sourceMap",
    title: "c1 브랜치는 80개 추적 파일로 데스크톱 AI 에이전트를 구성한다",
    points: [
      ["src/renderer", "Dashboard, Documents, GitActivity, Tasks, MeetingNotes, Settings 화면"],
      ["src/preload", "Renderer에서 main process로 접근하는 window.api IPC 경계"],
      ["src/main/handlers", "query, git, document, task, meeting, settings 요청 처리"],
      ["src/main/services", "RAG, chunking, question classification, LLM, git, metrics 서비스"],
      ["src/main/database", "sql.js schema, migrations, repositories"],
      ["scripts", "RAG 평가 데이터셋과 DB 검사 유틸리티"]
    ],
    note: "발표자료는 현재 c1 = origin/c1 기준 파일 구조와 핵심 구현 파일을 근거로 작성했다."
  },
  {
    kind: "architecture",
    title: "시스템은 Electron 내부에서 UI, IPC, 로컬 저장소, LLM 호출을 분리한다",
    layers: [
      ["Renderer", "React pages\nDashboard / Documents / Git Activity / Settings"],
      ["Preload IPC", "window.api\nquery:run / document / git / settings"],
      ["Main Process", "queryHandlers\nsource collection / validation / logging"],
      ["Persistence", "sql.js SQLite\nprojects / tasks / docs / query_logs / evidence_logs"],
      ["External", "Local Git + files\nOpenAI / Gemini / Claude provider"]
    ]
  },
  {
    kind: "pipeline",
    title: "질문 처리 파이프라인은 검색, 점수화, LLM, 로그 저장 순서로 닫힌다",
    steps: [
      ["1", "선택 검증", "toolRequiredSources와 Git 경로 검증"],
      ["2", "Source 수집", "git log, meetings, tasks, document chunks"],
      ["3", "질문 전처리", "keywords 추출 + question type 분류"],
      ["4", "Context 구성", "chunking, scoring weights, threshold, topK"],
      ["5", "LLM 호출", "provider 설정으로 chat messages 전송"],
      ["6", "결과 저장", "query_logs, ai_logs, evidence_logs, metrics"]
    ]
  },
  {
    kind: "matrix",
    title: "데이터 소스와 도구는 명시적인 조합으로 동작한다",
    rows: [
      ["Git Repository", "Git Progress Analyzer", "브랜치, 원격, 최근 커밋, 진행 요약"],
      ["Meeting Notes", "Meeting Summarizer", "회의 내용 요약과 결정사항 추출"],
      ["Tasks", "Task Status Query", "상태, 우선순위, 담당자, 마감일 질의"],
      ["Local Documents", "Document Search", "FTS 검색과 fallback recent chunk"],
      ["Mixed Sources", "Cross-source Report", "Git + 회의 + 태스크 근거 병합"]
    ]
  },
  {
    kind: "learning",
    title: "Evidence 피드백은 검색 점수와 context 크기를 다음 질문에 반영한다",
    weights: [
      ["wKeywordBase", "키워드 일치 기본 점수"],
      ["wFreqBonus", "반복 출현 보너스"],
      ["wPositionBonus", "문서 앞쪽 위치 보너스"],
      ["wTitleMatch", "제목 매칭"],
      ["wFirstChunk", "첫 청크 보너스"],
      ["wMeetingType / wTaskType", "소스 타입 가중치"]
    ],
    footer: "Debug Mode는 scoringWeights, selectedChunks, chunkFeatures를 Analysis Results에 노출한다."
  },
  {
    kind: "observability",
    title: "실행 검증은 DB 로그와 query-metrics.log로 남긴다",
    blocks: [
      ["sql.js DB", "Electron userData/capstone-agent.db\nprojects, meetings, tasks, document_sources, document_chunks_fts"],
      ["Evidence 로그", "query별 retrieval 결과 스냅샷\nscore와 metadata로 피드백 추적"],
      ["질문 메트릭", "원 질문, provider/model, token usage, LLM 지연시간, 전체 소요시간\nWindows: AppData\\Roaming\\capstone-agent\\query-metrics.log"]
    ]
  },
  {
    kind: "progress",
    title: "최근 c1 브랜치는 근거 검색과 학습 검증에 집중되어 있다",
    commits: [
      ["35b29fb", "Suggest Action LLM 연동 및 JSON parse"],
      ["e77eb24", "질문 메트릭 로그 경로 출력 보강"],
      ["95d1e24", "학습률 조정"],
      ["495f63b", "질문 메트릭 로그 저장"],
      ["78d67ec", "기본 threshold 0.5에서 0.2로 조정"],
      ["d6a8abc", "학습 초기화 버튼 추가"]
    ],
    note: "검증 기준: 로컬 c1과 origin/c1이 동일한 최신 커밋을 가리킴."
  },
  {
    kind: "validation",
    title: "발표 시 검증은 실제 질문 4개로 보여주는 것이 가장 설득력 있다",
    tests: [
      ["Git", "최근 git 커밋 기준으로 프로젝트 진행 상황을 요약해줘"],
      ["Documents", "로컬 문서 기준으로 중간발표 준비 상태를 알려줘"],
      ["Tasks", "아직 완료되지 않은 high priority 태스크를 알려줘"],
      ["Mixed", "지난 회의 이후 진행된 작업과 남은 리스크를 요약해줘"]
    ],
    metrics: ["evidence 표시 여부", "Debug Mode scoringWeights 변화", "query-metrics.log 토큰/시간 기록", "Suggested Actions JSON 파싱 결과"]
  },
  {
    kind: "roadmap",
    title: "남은 과제는 데모 안정화와 발표 완성도",
    items: [
      ["Demo hardening", "API key, Git path, local document indexing, DB 초기 상태를 데모 전에 고정"],
      ["Evaluation set", "데이터 소스별 정답 가능 질문과 근거 없는 질문을 분리해 검증"],
      ["UX polish", "Dashboard, Analysis Results, feedback state를 발표용 화면 흐름으로 정리"],
      ["Packaging", "새 컴퓨터 실행 가이드: npm install, API key 설정, npm run dev, Git/문서 경로 연결"]
    ],
    close: "목표: 답변을 생성하는 앱이 아니라, 근거를 확인하며 프로젝트 진행을 추적하는 로컬 AI 에이전트"
  }
];

function addBg(slide, ctx) {
  ctx.addShape(slide, { x: 0, y: 0, w: ctx.W, h: ctx.H, fill: C.soft });
  ctx.addShape(slide, { x: 0, y: 0, w: 16, h: ctx.H, fill: C.teal });
  ctx.addText(slide, {
    x: 72, y: 666, w: 700, h: 24,
    text: "Capstone Agent · c1 @ 35b29fb",
    fontSize: 13, color: C.muted
  });
  ctx.addText(slide, {
    x: 1120, y: 666, w: 90, h: 24,
    text: String(ctx.slideNumber).padStart(2, "0"),
    fontSize: 13, color: C.muted, align: "right"
  });
}

function title(slide, ctx, text, sub) {
  ctx.addText(slide, { x: 72, y: 52, w: 1030, h: 60, text, fontSize: 30, bold: true, color: C.ink, typeface: "Malgun Gothic" });
  if (sub) ctx.addText(slide, { x: 74, y: 112, w: 980, h: 32, text: sub, fontSize: 16, color: C.muted, typeface: "Malgun Gothic" });
}

function pill(slide, ctx, x, y, w, text, fill = C.mint, color = C.teal) {
  ctx.addShape(slide, { x, y, w, h: 34, geometry: "roundRect", fill, line: ctx.line(C.line, 1) });
  ctx.addText(slide, { x: x + 14, y: y + 7, w: w - 28, h: 20, text, fontSize: 13, bold: true, color, typeface: "Malgun Gothic" });
}

function panel(slide, ctx, x, y, w, h) {
  ctx.addShape(slide, { x, y, w, h, geometry: "roundRect", fill: C.panel, line: ctx.line(C.line, 1.2) });
}

function renderTitle(s, slide, ctx) {
  ctx.addShape(slide, { x: 0, y: 0, w: ctx.W, h: ctx.H, fill: "#F7F8F3" });
  ctx.addShape(slide, { x: 0, y: 0, w: 430, h: ctx.H, fill: C.teal });
  ctx.addShape(slide, { x: 56, y: 58, w: 95, h: 8, fill: C.amber });
  ctx.addText(slide, { x: 58, y: 88, w: 300, h: 28, text: s.kicker, fontSize: 17, bold: true, color: "#FFFFFF", typeface: "Malgun Gothic" });
  ctx.addText(slide, { x: 58, y: 148, w: 340, h: 104, text: s.title, fontSize: 47, bold: true, color: "#FFFFFF" });
  ctx.addText(slide, { x: 485, y: 142, w: 665, h: 96, text: s.subtitle, fontSize: 34, bold: true, color: C.ink, typeface: "Malgun Gothic" });
  ctx.addText(slide, { x: 486, y: 292, w: 565, h: 60, text: "로컬 프로젝트 기록을 선택하고, 근거 기반 답변과 다음 액션을 생성하는 데스크톱 앱", fontSize: 20, color: C.muted, typeface: "Malgun Gothic" });
  ["Data Sources", "RAG", "Evidence Feedback", "Query Metrics"].forEach((t, i) => pill(slide, ctx, 486 + i * 148, 420, 132, t));
  ctx.addText(slide, { x: 486, y: 620, w: 650, h: 24, text: s.footer, fontSize: 14, color: C.muted });
}

function renderProblem(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title);
  s.points.forEach((p, i) => {
    const x = 72 + (i % 2) * 555, y = 162 + Math.floor(i / 2) * 150;
    panel(slide, ctx, x, y, 500, 110);
    ctx.addText(slide, { x: x + 24, y: y + 20, w: 120, h: 26, text: p[0], fontSize: 20, bold: true, color: C.teal });
    ctx.addText(slide, { x: x + 24, y: y + 54, w: 440, h: 42, text: p[1], fontSize: 15, color: C.ink, typeface: "Malgun Gothic" });
  });
  panel(slide, ctx, 72, 504, 1054, 74);
  ctx.addText(slide, { x: 96, y: 526, w: 990, h: 30, text: s.claim, fontSize: 20, bold: true, color: C.coral, typeface: "Malgun Gothic" });
}

function renderSolution(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title, s.subtitle);
  const x0 = 86, y0 = 190;
  ["Data Source", "Tool / Analysis", "Prompt", "Analysis Results"].forEach((t, i) => {
    const x = x0 + i * 280;
    panel(slide, ctx, x, y0, 220, 105);
    ctx.addText(slide, { x: x + 18, y: y0 + 18, w: 180, h: 24, text: t, fontSize: 19, bold: true, color: C.ink });
    ctx.addText(slide, { x: x + 18, y: y0 + 54, w: 180, h: 32, text: i === 0 ? "선택할 근거" : i === 1 ? "분석 방식" : i === 2 ? "자연어 질문" : "요약 + 근거 + 액션", fontSize: 14, color: C.muted, typeface: "Malgun Gothic" });
    if (i < 3) ctx.addText(slide, { x: x + 232, y: y0 + 35, w: 34, h: 30, text: "→", fontSize: 27, bold: true, color: C.teal });
  });
  ctx.addText(slide, { x: 88, y: 354, w: 200, h: 28, text: "Data Sources", fontSize: 18, bold: true, color: C.ink });
  s.chips.forEach((t, i) => pill(slide, ctx, 88 + i * 250, 394, 212, t, "#FFFFFF"));
  ctx.addText(slide, { x: 88, y: 478, w: 200, h: 28, text: "Tools", fontSize: 18, bold: true, color: C.ink });
  s.tools.forEach((t, i) => pill(slide, ctx, 88 + (i % 3) * 330, 518 + Math.floor(i / 3) * 44, 292, t, "#FFF8E1", "#7A5200"));
}

function renderSourceMap(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title);
  s.points.forEach((p, i) => {
    const x = 84 + (i % 2) * 520;
    const y = 158 + Math.floor(i / 2) * 124;
    panel(slide, ctx, x, y, 460, 92);
    ctx.addText(slide, { x: x + 22, y: y + 18, w: 150, h: 24, text: p[0], fontSize: 18, bold: true, color: C.teal });
    ctx.addText(slide, { x: x + 22, y: y + 50, w: 404, h: 28, text: p[1], fontSize: 14, color: C.ink, typeface: "Malgun Gothic" });
  });
  ctx.addText(slide, { x: 96, y: 558, w: 900, h: 26, text: s.note, fontSize: 15, bold: true, color: C.coral, typeface: "Malgun Gothic" });
}

function renderArchitecture(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title);
  s.layers.forEach((l, i) => {
    const x = 66 + i * 224;
    panel(slide, ctx, x, 190, 190, 236);
    ctx.addShape(slide, { x: x + 20, y: 210, w: 50, h: 50, geometry: "ellipse", fill: i % 2 ? "#FFF8E1" : C.mint, line: ctx.line(C.line, 1) });
    ctx.addText(slide, { x: x + 20, y: 224, w: 50, h: 20, text: String(i + 1), fontSize: 18, bold: true, color: C.teal, align: "center" });
    ctx.addText(slide, { x: x + 20, y: 286, w: 150, h: 26, text: l[0], fontSize: 20, bold: true, color: C.ink });
    ctx.addText(slide, { x: x + 20, y: 326, w: 150, h: 70, text: l[1], fontSize: 14, color: C.muted, typeface: "Malgun Gothic" });
    if (i < s.layers.length - 1) ctx.addText(slide, { x: x + 196, y: 278, w: 30, h: 30, text: "→", fontSize: 24, bold: true, color: C.teal });
  });
  ctx.addText(slide, { x: 120, y: 494, w: 960, h: 44, text: "경계가 명확하기 때문에 UI 변경, 데이터 수집, LLM 호출, 저장소 스키마를 독립적으로 검증할 수 있다.", fontSize: 21, bold: true, color: C.coral, typeface: "Malgun Gothic", align: "center" });
}

function renderPipeline(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title);
  s.steps.forEach((st, i) => {
    const x = 82 + (i % 3) * 360, y = 162 + Math.floor(i / 3) * 190;
    panel(slide, ctx, x, y, 300, 132);
    ctx.addShape(slide, { x: x + 20, y: y + 22, w: 42, h: 42, geometry: "ellipse", fill: C.teal, line: ctx.line("none", 0) });
    ctx.addText(slide, { x: x + 20, y: y + 31, w: 42, h: 20, text: st[0], fontSize: 17, bold: true, color: "#FFFFFF", align: "center" });
    ctx.addText(slide, { x: x + 76, y: y + 23, w: 190, h: 24, text: st[1], fontSize: 19, bold: true, color: C.ink, typeface: "Malgun Gothic" });
    ctx.addText(slide, { x: x + 76, y: y + 58, w: 196, h: 42, text: st[2], fontSize: 14, color: C.muted, typeface: "Malgun Gothic" });
  });
}

function renderMatrix(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title);
  const x = 74, y = 154, w = 1040;
  ["Data Source", "Tool", "결과"].forEach((h, i) => {
    ctx.addShape(slide, { x: x + [0, 300, 620][i], y, w: [280, 300, 420][i], h: 42, fill: C.teal, line: ctx.line("none", 0) });
    ctx.addText(slide, { x: x + [0, 300, 620][i] + 16, y: y + 12, w: [250, 270, 390][i], h: 18, text: h, fontSize: 14, bold: true, color: "#FFFFFF", typeface: "Malgun Gothic" });
  });
  s.rows.forEach((r, idx) => {
    const yy = y + 42 + idx * 70;
    [0, 300, 620].forEach((xx, i) => ctx.addShape(slide, { x: x + xx, y: yy, w: [280, 300, 420][i], h: 70, fill: idx % 2 ? "#FFFFFF" : "#FBFCFA", line: ctx.line(C.line, 1) }));
    ctx.addText(slide, { x: x + 16, y: yy + 20, w: 240, h: 22, text: r[0], fontSize: 15, bold: true, color: C.ink });
    ctx.addText(slide, { x: x + 316, y: yy + 20, w: 260, h: 22, text: r[1], fontSize: 15, bold: true, color: C.teal });
    ctx.addText(slide, { x: x + 636, y: yy + 18, w: 380, h: 28, text: r[2], fontSize: 14, color: C.muted, typeface: "Malgun Gothic" });
  });
}

function renderLearning(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title);
  panel(slide, ctx, 82, 150, 440, 408);
  ctx.addText(slide, { x: 112, y: 184, w: 360, h: 30, text: "ScoringWeights", fontSize: 25, bold: true, color: C.ink });
  s.weights.forEach((w, i) => {
    const y = 242 + i * 44;
    ctx.addText(slide, { x: 114, y, w: 165, h: 20, text: w[0], fontSize: 14, bold: true, color: C.teal });
    ctx.addText(slide, { x: 286, y, w: 200, h: 20, text: w[1], fontSize: 13, color: C.muted, typeface: "Malgun Gothic" });
  });
  ["Evidence 선택", "interested / not_interested", "Bayesian n값 반영", "다음 질문 scoring 변화"].forEach((t, i) => {
    const x = 590, y = 168 + i * 86;
    pill(slide, ctx, x, y, 300, t, i % 2 ? "#FFF8E1" : C.mint, i % 2 ? "#7A5200" : C.teal);
    if (i < 3) ctx.addText(slide, { x: 724, y: y + 42, w: 30, h: 30, text: "↓", fontSize: 24, color: C.teal });
  });
  ctx.addText(slide, { x: 590, y: 520, w: 470, h: 36, text: s.footer, fontSize: 14, color: C.muted, typeface: "Malgun Gothic" });
}

function renderObservability(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title);
  s.blocks.forEach((b, i) => {
    const x = 82 + i * 350;
    panel(slide, ctx, x, 180, 305, 310);
    ctx.addText(slide, { x: x + 24, y: 214, w: 250, h: 28, text: b[0], fontSize: 22, bold: true, color: C.ink, typeface: "Malgun Gothic" });
    ctx.addShape(slide, { x: x + 24, y: 258, w: 64, h: 6, fill: [C.teal, C.coral, C.amber][i] });
    ctx.addText(slide, { x: x + 24, y: 292, w: 245, h: 128, text: b[1], fontSize: 15, color: C.muted, typeface: "Malgun Gothic" });
  });
  ctx.addText(slide, { x: 92, y: 552, w: 930, h: 26, text: "로그는 데모 실패 원인을 재현하는 데 필요한 최소 증거다: 원 질문, 토큰, 지연시간, 선택 청크 수.", fontSize: 19, bold: true, color: C.coral, typeface: "Malgun Gothic" });
}

function renderProgress(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title);
  ctx.addShape(slide, { x: 118, y: 172, w: 5, h: 346, fill: C.teal });
  s.commits.forEach((c, i) => {
    const y = 172 + i * 58;
    ctx.addShape(slide, { x: 103, y: y + 8, w: 34, h: 34, geometry: "ellipse", fill: "#FFFFFF", line: ctx.line(C.teal, 2) });
    ctx.addText(slide, { x: 164, y, w: 110, h: 22, text: c[0], fontSize: 16, bold: true, color: C.teal });
    ctx.addText(slide, { x: 285, y, w: 460, h: 24, text: c[1], fontSize: 17, color: C.ink, typeface: "Malgun Gothic" });
  });
  panel(slide, ctx, 860, 174, 260, 120);
  ctx.addText(slide, { x: 886, y: 204, w: 210, h: 32, text: "Latest baseline", fontSize: 19, bold: true, color: C.ink });
  ctx.addText(slide, { x: 886, y: 246, w: 210, h: 24, text: "branch c1 = origin/c1", fontSize: 16, color: C.teal, bold: true });
  ctx.addText(slide, { x: 164, y: 552, w: 760, h: 24, text: s.note, fontSize: 14, color: C.muted, typeface: "Malgun Gothic" });
}

function renderValidation(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title);
  s.tests.forEach((t, i) => {
    const x = 88 + (i % 2) * 515, y = 158 + Math.floor(i / 2) * 120;
    panel(slide, ctx, x, y, 455, 88);
    ctx.addText(slide, { x: x + 22, y: y + 20, w: 118, h: 24, text: t[0], fontSize: 17, bold: true, color: C.teal });
    ctx.addText(slide, { x: x + 156, y: y + 18, w: 268, h: 42, text: t[1], fontSize: 15, color: C.ink, typeface: "Malgun Gothic" });
  });
  ctx.addText(slide, { x: 92, y: 438, w: 180, h: 24, text: "확인 지표", fontSize: 19, bold: true, color: C.ink, typeface: "Malgun Gothic" });
  s.metrics.forEach((m, i) => pill(slide, ctx, 92 + (i % 2) * 485, 486 + Math.floor(i / 2) * 46, 420, m, "#FFFFFF", C.ink));
}

function renderRoadmap(s, slide, ctx) {
  addBg(slide, ctx); title(slide, ctx, s.title);
  s.items.forEach((it, i) => {
    const y = 156 + i * 92;
    ctx.addText(slide, { x: 96, y: y + 4, w: 200, h: 24, text: it[0], fontSize: 20, bold: true, color: [C.teal, C.coral, C.olive, "#7A5200"][i] });
    ctx.addShape(slide, { x: 310, y: y + 13, w: 700, h: 1.5, fill: C.line });
    ctx.addText(slide, { x: 332, y: y + 34, w: 660, h: 32, text: it[1], fontSize: 16, color: C.ink, typeface: "Malgun Gothic" });
  });
  panel(slide, ctx, 96, 564, 980, 56);
  ctx.addText(slide, { x: 124, y: 582, w: 920, h: 22, text: s.close, fontSize: 18, bold: true, color: C.teal, typeface: "Malgun Gothic", align: "center" });
}

const renderers = {
  title: renderTitle,
  problem: renderProblem,
  solution: renderSolution,
  sourceMap: renderSourceMap,
  architecture: renderArchitecture,
  pipeline: renderPipeline,
  matrix: renderMatrix,
  learning: renderLearning,
  observability: renderObservability,
  progress: renderProgress,
  validation: renderValidation,
  roadmap: renderRoadmap
};

export function addDeckSlide(presentation, ctx, index) {
  const slide = presentation.slides.add();
  const s = slides[index - 1];
  renderers[s.kind](s, slide, ctx);
  return slide;
}
