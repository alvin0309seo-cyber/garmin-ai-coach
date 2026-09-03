require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { cleanEnv, normalizeSupabaseUrl } = require('./env');

// 아까 작성했던 데이터 수집기들 불러오기
const { getGarminData } = require('./garmin');
const { getBaseRecommendation } = require('./rule');
const { getAiRecommendation } = require('./ai');

// 🚨 핵심 수정: 환경변수는 어디서 왔든(따옴표·공백이 섞여 있어도) cleanEnv가 벗겨서 읽는다.
// 🚨 핵심 수정: 잘못된 폴백 URL 분기는 제거 — URL/키가 없으면 조용히 엉뚱한 DB로
//    넘어가지 않고 즉시 실패시킨다.
const supabaseUrl = normalizeSupabaseUrl(cleanEnv('SUPABASE_URL'));
const supabaseKey = cleanEnv('SUPABASE_KEY') || cleanEnv('SUPABASE_ANON_KEY');

if (!supabaseUrl) {
    console.error('❌ SUPABASE_URL 환경변수가 없거나 비어 있습니다. .env 또는 GitHub Actions 시크릿을 확인하세요.');
    process.exit(1);
}
if (!supabaseKey) {
    console.error('❌ SUPABASE_KEY 환경변수가 없습니다. .env 또는 GitHub Actions 시크릿을 확인하세요.');
    process.exit(1);
}

console.log(`🔑 Supabase 연결 URL: ${supabaseUrl}`);
const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadToDatabase() {
    try {
        console.log("🏃‍♂️ 1. 가민에서 진짜 내 데이터 가져오는 중...");
        const garminData = await getGarminData(); 

        // 🚨 핵심: 최신 인바디 체성분 데이터 로드 (없으면 null → AI 프롬프트에서 생략)
        // 🚨 핵심: supabase-js 는 테이블 미존재 등 오류를 throw 하지 않고 { error } 로 반환하므로
        //    명시적으로 확인해 조용히 넘어가지 않게 한다 (silent fallback 금지).
        let inbodyData = null;
        try {
            const { data: inbodyRows, error: inbodyErr } = await supabase
                .from('inbody_results')
                .select('raw_json, measured_at')
                .order('measured_at', { ascending: false })
                .limit(1);

            if (inbodyErr) {
                console.log('⚠️ 인바디 데이터 조회 실패 (무시하고 계속):', inbodyErr.message);
            } else {
                inbodyData = inbodyRows?.[0]?.raw_json || null;
                if (inbodyData) {
                    console.log('📊 최신 인바디 데이터 로드:', inbodyRows[0].measured_at);
                } else {
                    console.log('ℹ️ 인바디 데이터 없음 (아직 측정 기록 없음)');
                }
            }
        } catch (e) {
            console.log('⚠️ 인바디 데이터 로드 실패 (무시하고 계속):', e.message);
        }
        
        console.log("🧠 2. 추천 로직 및 AI 코치 계획 생성 중...");
        const recommendation = getBaseRecommendation(garminData, inbodyData);
        const aiPlan = await getAiRecommendation(garminData, recommendation, inbodyData);

        // 가민 데이터 날짜(KST 기준)와 일치시킴
        const today = garminData.date;

        console.log(`📦 3. Supabase 창고에 안전하게 보관 중... (기준일: ${today})`);
        const { data, error } = await supabase
            .from('daily_plans')
            .upsert([
                { 
                    date: today, 
                    garmin_data: garminData, 
                    system_rule: recommendation, 
                    ai_coach: aiPlan 
                }
            ], { onConflict: 'date' });

        if (error) throw error;
        console.log("🎉 성공! 데이터가 DB에 완벽하게 저장되었습니다.");
        process.exit(0); // 작업 완료 후 알아서 깔끔하게 종료
        
    } catch (error) {
        console.error("❌ 에러 발생:", error);
        process.exit(1);
    }
}

uploadToDatabase();
