/**
 * AI Service — Phân tích báo cáo điểm số thông minh
 * Gemini 2.0 Flash (chính) + Groq Llama (dự phòng tự động)
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `Bạn là trợ lý AI phân tích dữ liệu giáo dục cho hệ thống EduCheck của một trường học Việt Nam.

Vai trò: Phân tích dữ liệu điểm thưởng/phạt của học sinh, đưa ra nhận định và đề xuất cải thiện.

Quy tắc:
- Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng
- Sử dụng bullet points và định dạng markdown (bold, heading)
- Không dài quá 300 từ
- Đưa ra đề xuất cụ thể, thực tế cho ban giám hiệu và GVCN
- Nếu dữ liệu trống hoặc ít, nói rõ "chưa đủ dữ liệu"
- Không bịa số liệu, chỉ phân tích dựa trên dữ liệu được cung cấp
- Dùng ký hiệu text thay vì emoji: [!] cảnh báo, [+] tích cực, [-] tiêu cực, [>] đề xuất`;

interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

// Build context string from stats data
function buildDataContext(stats: any): string {
    if (!stats) return 'Không có dữ liệu.';

    const lines: string[] = [
        `=== DỮ LIỆU THỐNG KÊ ĐIỂM ===`,
        `Giai đoạn: ${stats.range === 'day' ? 'Hôm nay' : stats.range === 'week' ? '7 ngày qua' : '30 ngày qua'}`,
        `Tổng điểm cộng: +${stats.totalAdded || 0}`,
        `Tổng điểm trừ: -${stats.totalDeducted || 0}`,
        `Cân bằng: ${(stats.totalAdded || 0) - (stats.totalDeducted || 0)}`,
        `Tổng lượt ghi nhận: ${stats.logsCount || 0}`,
        ``,
        `So với kỳ trước:`,
        `- Điểm cộng kỳ trước: +${stats.prevAdded || 0}`,
        `- Điểm trừ kỳ trước: -${stats.prevDeducted || 0}`,
        `- Lượt ghi nhận kỳ trước: ${stats.prevLogsCount || 0}`,
        ``,
        `Phân bố theo hạng mục:`,
        `- Nội trú: ${stats.byCategory?.boarding || 0} điểm`,
        `- Sự kiện: ${stats.byCategory?.event || 0} điểm`,
        `- Thủ công: ${stats.byCategory?.manual || 0} điểm`,
    ];

    if (stats.topAdded?.length > 0) {
        lines.push(``, `Top HS được cộng nhiều nhất:`);
        stats.topAdded.forEach((u: any, i: number) => {
            lines.push(`  ${i + 1}. ${u.name} (${u.org}) — +${u.points} điểm`);
        });
    }

    if (stats.topDeducted?.length > 0) {
        lines.push(``, `Top HS bị trừ nhiều nhất:`);
        stats.topDeducted.forEach((u: any, i: number) => {
            lines.push(`  ${i + 1}. ${u.name} (${u.org}) — -${u.points} điểm`);
        });
    }

    if (stats.dailyTrend?.length > 0) {
        lines.push(``, `Biến động theo ngày:`);
        stats.dailyTrend.forEach((d: any) => {
            lines.push(`  ${d.date}: cộng +${d.added}, trừ -${d.deducted} (${d.count} lượt)`);
        });
    }

    return lines.join('\n');
}

// Call Gemini API
async function callGemini(messages: GeminiMessage[]): Promise<string> {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: {
                parts: [{ text: SYSTEM_PROMPT }]
            },
            contents: messages,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024,
                topP: 0.9,
            }
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Gemini API error:', errData);
        throw new Error(errData?.error?.message || `Gemini lỗi: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini không trả về kết quả');
    return text;
}

// Call Groq API (OpenAI-compatible format)
async function callGroq(userPrompt: string): Promise<string> {
    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 1024
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Groq API error:', errData);
        throw new Error(errData?.error?.message || `Groq lỗi: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq không trả về kết quả');
    return text;
}

/**
 * Smart AI caller: Groq chính → Gemini dự phòng
 */
async function callAI(messages: GeminiMessage[]): Promise<string> {
    const fullPrompt = messages.map(m => m.parts[0].text).join('\n\n');

    // Try Groq first (higher free limits)
    if (GROQ_API_KEY) {
        try {
            return await callGroq(fullPrompt);
        } catch (err) {
            console.warn('Groq failed, falling back to Gemini...', err);
        }
    }

    // Fallback to Gemini
    if (GEMINI_API_KEY) {
        try {
            return await callGemini(messages);
        } catch (err) {
            console.error('Gemini also failed:', err);
            throw err;
        }
    }

    throw new Error('Chưa cấu hình API Key AI (Groq hoặc Gemini)');
}

/**
 * Auto-analysis: Phân tích tự động khi load trang
 */
export async function analyzePointData(stats: any): Promise<string> {
    const context = buildDataContext(stats);

    const messages: GeminiMessage[] = [
        {
            role: 'user',
            parts: [{
                text: `${context}\n\n---\nHãy phân tích dữ liệu trên và đưa ra:\n1. Tổng quan tình hình (2-3 câu)\n2. Điểm đáng chú ý (nếu có HS/lớp nổi bật)\n3. So sánh với kỳ trước (tăng/giảm)\n4. Đề xuất cải thiện cụ thể cho ban giám hiệu`
            }]
        }
    ];

    return callAI(messages);
}

/**
 * Chat Q&A: Trả lời câu hỏi dựa trên dữ liệu
 */
export async function chatWithData(
    question: string,
    stats: any,
    chatHistory: { role: 'user' | 'ai'; text: string }[]
): Promise<string> {
    const context = buildDataContext(stats);

    const messages: GeminiMessage[] = [];

    // First message: provide data context
    messages.push({
        role: 'user',
        parts: [{ text: `Dữ liệu thống kê điểm hiện tại:\n\n${context}\n\nHãy ghi nhớ dữ liệu này để trả lời các câu hỏi tiếp theo.` }]
    });
    messages.push({
        role: 'model',
        parts: [{ text: 'Đã ghi nhận dữ liệu. Tôi sẵn sàng phân tích và trả lời câu hỏi.' }]
    });

    // Add chat history
    chatHistory.forEach(msg => {
        messages.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        });
    });

    // Add current question
    messages.push({
        role: 'user',
        parts: [{ text: question }]
    });

    return callAI(messages);
}

/**
 * Text-to-Speech: Đọc text bằng giọng nói
 */
export function speakText(text: string): void {
    if (!('speechSynthesis' in window)) {
        console.warn('Trình duyệt không hỗ trợ Text-to-Speech');
        return;
    }

    // Stop any current speech
    window.speechSynthesis.cancel();

    // Clean markdown formatting
    const cleanText = text
        .replace(/[*#_`~]/g, '')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ', ')
        .replace(/[-•]/g, '')
        .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Try to find Vietnamese voice
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.startsWith('vi'));
    if (viVoice) utterance.voice = viVoice;

    window.speechSynthesis.speak(utterance);
}

/**
 * Stop TTS
 */
export function stopSpeaking(): void {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
}

/**
 * Behavior Analysis: Phân tích hành vi cá nhân hóa
 */
export async function analyzeStudentBehavior(report: any): Promise<string> {
    const LEVEL_TAG: Record<string, string> = { red: '[CRITICAL]', yellow: '[CAUTION]', green: '[OK]', star: '[EXCELLENT]' };

    const lines: string[] = [
        `=== BÁO CÁO HÀNH VI HỌC SINH (${report.weeksAnalyzed} tuần) ===`,
        `Tổng: ${report.summary.totalStudents} HS`,
        `[CRITICAL] Cần can thiệp: ${report.summary.alertRed}`,
        `[CAUTION]  Cần theo dõi: ${report.summary.alertYellow}`,
        `[OK]       Ổn định: ${report.summary.alertGreen}`,
        `[EXCELLENT] Xuất sắc: ${report.summary.alertStar}`,
        ``,
    ];

    // Red + Yellow students (priority)
    const priority = report.students.filter((s: any) => s.alertLevel === 'red' || s.alertLevel === 'yellow');
    if (priority.length > 0) {
        lines.push(`--- HS CẦN CHÚ Ý ---`);
        priority.slice(0, 15).forEach((s: any) => {
            const tag = LEVEL_TAG[s.alertLevel] || '[--]';
            lines.push(`${tag} ${s.name} (${s.class}) — Xu hướng: ${s.trendDetail}`);
            lines.push(`  Muộn: ${s.totalLate} lần | Vắng: ${s.totalAbsent} | Trừ: -${s.totalDeducted} | Cộng: +${s.totalAdded}`);
            if (s.alertReasons.length > 0) lines.push(`  Lý do: ${s.alertReasons.join(', ')}`);
            if (s.repeatedViolations.length > 0) {
                s.repeatedViolations.slice(0, 2).forEach((v: any) => {
                    lines.push(`  Vi phạm lặp: "${v.reason}" (${v.count} lần)`);
                });
            }
            // Weekly data
            const lastWeeks = s.weeklyTrend.slice(-3);
            lines.push(`  Biến động: ${lastWeeks.map((w: any) => `${w.week}: trừ -${w.pointsDeducted}, muộn ${w.lateCount}`).join(' > ')}`);
            lines.push(``);
        });
    }

    // Star students
    const stars = report.students.filter((s: any) => s.alertLevel === 'star');
    if (stars.length > 0) {
        lines.push(`--- HS XUẤT SẮC ---`);
        stars.slice(0, 10).forEach((s: any) => {
            lines.push(`[EXCELLENT] ${s.name} (${s.class}) — +${s.totalAdded} điểm, ${s.trendDetail}`);
        });
    }

    // Class summary
    if (report.classSummary?.length > 0) {
        lines.push(``, `--- TỔNG HỢP THEO LỚP ---`);
        report.classSummary.forEach((c: any) => {
            lines.push(`${c.className}: ${c.studentCount} HS, TB ${c.avgPoints}đ | Nguy:${c.redCount} Chú ý:${c.yellowCount} Tốt:${c.greenCount} Giỏi:${c.starCount}`);
        });
    }

    const context = lines.join('\n');

    const messages: GeminiMessage[] = [
        {
            role: 'user',
            parts: [{
                text: `${context}\n\n---\nBạn là chuyên gia tư vấn giáo dục. Phân tích báo cáo trên và đưa ra:\n\n1. **CẢNH BÁO SỚM**: Những HS nào cần can thiệp gấp? Mô tả cụ thể vấn đề.\n2. **ĐỀ XUẤT CHO GVCN**: Hành động cụ thể cho từng HS (gặp riêng, gọi phụ huynh, gắn kèm bạn tốt...)\n3. **TUYÊN DƯƠNG**: HS nào cần được khen thưởng kịp thời? Đề xuất hình thức.\n4. **NHẬN ĐỊNH TỔNG QUAN**: Xu hướng chung của trường/lớp trong ${report.weeksAnalyzed} tuần.\n\nTrả lời ngắn gọn, thực tế, dễ hành động. Sử dụng bullet points và định dạng rõ ràng. Dùng ký hiệu [!] cho cảnh báo, [+] cho tích cực, [-] cho tiêu cực, [>] cho đề xuất.`
            }]
        }
    ];

    return callAI(messages);
}

/**
 * Chat with student behavior data
 */
export async function chatWithStudentData(
    question: string,
    behaviorReport: any,
    stats: any,
    chatHistory: { role: 'user' | 'ai'; text: string }[]
): Promise<string> {
    // Build compact context from behavior report
    const contextLines: string[] = [`Dữ liệu hành vi ${behaviorReport.weeksAnalyzed} tuần, ${behaviorReport.summary.totalStudents} HS:`];
    contextLines.push(`Nguy hiểm:${behaviorReport.summary.alertRed} | Chú ý:${behaviorReport.summary.alertYellow} | Tốt:${behaviorReport.summary.alertGreen} | Xuất sắc:${behaviorReport.summary.alertStar}`);

    // Include relevant students (top priority + stars + mentioned in question)
    const CHAT_TAG: Record<string, string> = { red: '[!]', yellow: '[?]', star: '[*]', green: '[v]' };
    const relevant = behaviorReport.students.filter((s: any) => {
        if (s.alertLevel === 'red' || s.alertLevel === 'yellow' || s.alertLevel === 'star') return true;
        if (question.toLowerCase().includes(s.name.toLowerCase())) return true;
        if (question.toLowerCase().includes(s.class.toLowerCase())) return true;
        return false;
    }).slice(0, 20);

    relevant.forEach((s: any) => {
        const tag = CHAT_TAG[s.alertLevel] || '[v]';
        contextLines.push(`${tag} ${s.name} (${s.class}): tổng ${s.totalPoints}đ, muộn ${s.totalLate}, vắng ${s.totalAbsent}, trừ -${s.totalDeducted}, cộng +${s.totalAdded}, ${s.trendDetail}`);
    });

    // Also include aggregate stats if available
    if (stats) {
        const aggContext = buildDataContext(stats);
        contextLines.push(`\n--- Thống kê tổng ---\n${aggContext}`);
    }

    const context = contextLines.join('\n');
    const messages: GeminiMessage[] = [];

    messages.push({
        role: 'user',
        parts: [{ text: `Dữ liệu phân tích hành vi HS:\n\n${context}\n\nGhi nhớ dữ liệu này để trả lời câu hỏi. Bạn là chuyên gia giáo dục, đưa đề xuất cụ thể cho GVCN.` }]
    });
    messages.push({
        role: 'model',
        parts: [{ text: 'Đã ghi nhận. Tôi sẵn sàng phân tích và tư vấn về hành vi từng học sinh.' }]
    });

    chatHistory.forEach(msg => {
        messages.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        });
    });

    messages.push({ role: 'user', parts: [{ text: question }] });
    return callAI(messages);
}

/**
 * Check if any AI is configured
 */
export function isAIConfigured(): boolean {
    return !!(GEMINI_API_KEY || GROQ_API_KEY);
}

