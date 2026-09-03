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
        
        console.log("🧠 2. 추천 로직 및 AI 코치 계획 생성 중...");
        const recommendation = getBaseRecommendation(garminData);
        const aiPlan = await getAiRecommendation(garminData, recommendation);

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
