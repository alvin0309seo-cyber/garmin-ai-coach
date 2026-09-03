// 공용 환경변수 유틸
// .env / OS 환경변수 / GitHub Actions 시크릿 어디서 값이 왔든,
// 앞뒤 공백과 감싸는 따옴표(" 또는 ')를 벗겨서 안전하게 읽는다.
// 🚨 값 자체는 어떤 경우에도 로그/출력에 찍지 않는다.

/**
 * 환경변수를 안전하게 읽는다.
 * - 값이 없으면 undefined 반환
 * - 앞뒤 공백 제거
 * - 감싸는 따옴표(" 또는 ')를 한 겹 벗김 (값 내용은 그대로)
 */
function cleanEnv(name) {
    const raw = process.env[name];
    if (raw === undefined || raw === null) return undefined;
    let val = raw.trim();
    if (val.length >= 2) {
        const first = val[0];
        const last = val[val.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            val = val.slice(1, -1);
        }
    }
    return val;
}

/**
 * Supabase URL 정규화.
 * - 값이 없거나 비어 있으면 null 반환 (호출부에서 명확히 실패 처리)
 * - https:// (또는 http://) 접두사가 없으면 https:// 를 자동으로 붙임
 * - 🚨 폴백 URL·도메인 화이트리스트 같은 조용한 우회 로직은 두지 않는다.
 */
function normalizeSupabaseUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
        return null;
    }
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
    }
    return url;
}

module.exports = { cleanEnv, normalizeSupabaseUrl };
