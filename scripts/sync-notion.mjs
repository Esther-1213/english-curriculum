// Notion 데이터베이스의 내신 일정을 읽어 exam.html에 채워 넣습니다.
// 사용법: node scripts/sync-notion.mjs [대상 html 경로]
// 필요한 환경 변수: NOTION_TOKEN, NOTION_DATABASE_ID

import { readFile, writeFile } from 'node:fs/promises';

// Notion 속성 이름. 노션에서 열 이름을 바꾸면 여기도 똑같이 바꿔 주세요.
const PROP = {
  date: '날짜',          // 날짜 속성 (필수). 비워 두면 그 행은 페이지에 나오지 않습니다.
  test: '빈칸 테스트',    // 텍스트
  lecture: '지문 설명',   // 텍스트
  homework: '숙제',       // 텍스트
  kind: '구분',           // 선택 속성 (선택 사항). '시험'으로 고른 행의 날짜 범위가 시험 기간이 됩니다.
};
const EXAM_KIND = '시험';

const NOTION_VERSION = '2025-09-03';
const API = 'https://api.notion.com/v1';
const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

const target = process.argv[2] || 'exam.html';
const token = process.env.NOTION_TOKEN;
const rawId = process.env.NOTION_DATABASE_ID;

if (!token || !rawId) {
  console.log('NOTION_TOKEN 또는 NOTION_DATABASE_ID가 없어 Notion 동기화를 건너뜁니다. 저장된 일정 그대로 배포합니다.');
  process.exit(0);
}

// 링크 전체를 붙여 넣어도 ID만 골라냅니다.
function cleanId(value) {
  const hex = value.replace(/-/g, '').match(/[0-9a-f]{32}/i);
  if (!hex) throw new Error('NOTION_DATABASE_ID에서 32자리 ID를 찾지 못했습니다. 데이터베이스 링크를 다시 확인해 주세요.');
  return hex[0];
}

async function notion(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Notion API ${res.status}: ${data.message || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// 데이터베이스 ID → 데이터 소스 ID (2025-09-03 API 방식)
async function resolveDataSource(id) {
  try {
    const db = await notion('GET', `/databases/${id}`);
    if (!db.data_sources?.length) throw new Error('데이터베이스 안에 데이터 소스가 없습니다.');
    return db.data_sources[0].id;
  } catch (e) {
    if (e.status === 404 || e.status === 400) return id; // 데이터 소스 ID를 넣은 경우
    throw e;
  }
}

async function fetchAll(dataSourceId) {
  const pages = [];
  let cursor;
  do {
    const data = await notion('POST', `/data_sources/${dataSourceId}/query`, {
      sorts: [{ property: PROP.date, direction: 'ascending' }],
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function text(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':
    case 'rich_text':
      return prop[prop.type].map((t) => t.plain_text).join('').trim();
    case 'select':
    case 'status':
      return prop[prop.type]?.name ?? '';
    case 'multi_select':
      return prop.multi_select.map((o) => o.name).join(', ');
    case 'number':
      return prop.number == null ? '' : String(prop.number);
    case 'formula':
      return String(prop.formula?.[prop.formula.type] ?? '');
    default:
      return '';
  }
}

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cell = (s) => escape(s).replace(/\n/g, '<br>');

function day(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { label: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`, weekday };
}

function row(r) {
  const { label, weekday } = day(r.date);
  return (
    `        <div class="schedule-row" role="row">` +
    `<div class="schedule-day" role="cell"><strong>${label}</strong><small>${weekday}</small></div>` +
    `<div role="cell" data-label="빈칸 테스트">${cell(r.test)}</div>` +
    `<div role="cell" data-label="지문 설명">${cell(r.lecture)}</div>` +
    `<div role="cell" data-label="다음 차시까지의 숙제">${cell(r.homework)}</div></div>\n`
  );
}

function kstStamp(iso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.month}월 ${p.day}일 ${p.dayPeriod} ${p.hour}:${p.minute}`;
}

function replaceBlock(html, name, content) {
  const re = new RegExp(`(<!-- NOTION:${name}:START -->)[\\s\\S]*?(<!-- NOTION:${name}:END -->)`, 'g');
  if (!re.test(html)) throw new Error(`${target}에서 NOTION:${name} 표시를 찾지 못했습니다.`);
  return html.replace(re, (_, a, b) => `${a}${content}${b}`);
}

const dataSourceId = await resolveDataSource(cleanId(rawId));
const pages = await fetchAll(dataSourceId);

const lessons = [];
let exam = null;
let lastEdited = null;

for (const page of pages) {
  const p = page.properties;
  if (!(PROP.date in p)) throw new Error(`Notion에 '${PROP.date}' 속성이 없습니다. 열 이름을 확인해 주세요.`);
  const date = p[PROP.date]?.date;
  if (!date?.start) continue;
  if (!lastEdited || page.last_edited_time > lastEdited) lastEdited = page.last_edited_time;

  if (text(p[PROP.kind]) === EXAM_KIND) {
    exam = date;
    continue;
  }
  lessons.push({
    date: date.start,
    test: text(p[PROP.test]),
    lecture: text(p[PROP.lecture]),
    homework: text(p[PROP.homework]),
  });
}

// 노션 연결이 잘못돼 비어 있으면 기존 페이지를 지우지 않고 멈춥니다.
if (!lessons.length) {
  throw new Error('Notion에서 날짜가 있는 수업 행을 하나도 찾지 못했습니다. 기존 페이지를 그대로 둡니다.');
}

let html = await readFile(target, 'utf8');
html = replaceBlock(html, 'ROWS', '\n' + lessons.map(row).join('') + '        ');

if (exam) {
  const start = day(exam.start).label;
  const range = exam.end && exam.end.slice(0, 10) !== exam.start.slice(0, 10) ? `${start} — ${day(exam.end).label}` : start;
  html = replaceBlock(html, 'EXAM', range);
}
if (lastEdited) {
  html = replaceBlock(html, 'UPDATED', ` <span class="updated-at">마지막 수정 ${kstStamp(lastEdited)}</span>`);
}

await writeFile(target, html);
console.log(`Notion 일정 ${lessons.length}개를 반영했습니다${exam ? `, 시험 기간 ${exam.start}${exam.end ? ` ~ ${exam.end}` : ''}` : ''}.`);
