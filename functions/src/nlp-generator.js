const { defineString } = require("firebase-functions/params");
const { GoogleGenAI, Type, Schema } = require("@google/genai");

// Assumes the GEMINI_API_KEY environment variable is defined in Firebase config or Secrets
const geminiApiKey = defineString("GEMINI_API_KEY", {
	default: "",
	description: "API Key for Gemini API",
});

let aiClient = null;

function getAiClient() {
	if (!aiClient) {
		const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
		aiClient = new GoogleGenAI({ apiKey });
	}
	return aiClient;
}

const responseSchema = {
	type: Type.OBJECT,
	properties: {
		title: {
			type: Type.STRING,
			description: "O título sugerido para o contador, caso seja fornecido um genérico."
		},
		checklist: {
			type: Type.ARRAY,
			description: "Lista de subtarefas ordenadas recomendadas",
			items: { type: Type.STRING }
		},
		counterParams: {
			type: Type.OBJECT,
			description: "Parâmetros do contador extraídos do prompt, caso existam.",
			properties: {
				type: { type: Type.STRING, description: "Tipo de contador: 'fixed' ou 'recurring'" },
				startAtMs: { type: Type.INTEGER, description: "Timestamp de início em milissegundos Unix, apenas para type 'fixed'. Caso contrário nulo." },
				endAtMs: { type: Type.INTEGER, description: "Timestamp de fim em milissegundos Unix, apenas para type 'fixed'. Caso contrário nulo." },
				startTime: { type: Type.STRING, description: "Hora de início no formato HH:MM, apenas para type 'recurring'. Caso contrário nulo." },
				endTime: { type: Type.STRING, description: "Hora de fim no formato HH:MM, apenas para type 'recurring'. Caso contrário nulo." },
				daysOfWeek: { type: Type.ARRAY, description: "Dias da semana (0=Domingo, 6=Sábado), apenas para type 'recurring'.", items: { type: Type.INTEGER } }
			}
		}
	},
	required: ["title", "checklist"]
};

async function generateChecklistForPrompt(promptText) {
	const ai = getAiClient();
	const systemInstruction = `Você é um assistente especializado em produtividade e conversão de tempo.
O usuário quer criar um contador de tempo (regressivo ou progressivo) com o seguinte texto: "${promptText}".
A data e hora atual em formato ISO (UTC) é: ${new Date().toISOString()}.

Seu objetivo é:
1. Interpretar a intenção de data, horário ou recorrência do usuário em QUALQUER IDIOMA (português, inglês, espanhol, etc.):
   - Se for um evento fixo com data/hora no futuro (ex: "friday at 10am", "reunião amanhã às 15h", "launch on august 15"):
     - Defina 'type' como 'fixed'.
     - Defina 'startAtMs' como o timestamp Unix atual em milissegundos (${Date.now()}).
     - Defina 'endAtMs' como o timestamp Unix exato da data/hora do evento em milissegundos.
   - Se for um evento recorrente (ex: "toda segunda das 9h às 10h", "every monday at 9am"):
     - Defina 'type' como 'recurring', 'startTime', 'endTime' (HH:MM) e 'daysOfWeek' (0=Domingo..6=Sábado).
   - Se nenhum parâmetro de tempo puder ser extraído, omita 'counterParams'.
2. Gerar uma lista de subtarefas (checklist) de no MÁXIMO 3 etapas essenciais, curtas e diretas.
3. O 'title' e a 'checklist' devem ser traduzidos e formatados em português (Brasil).
O output deve ser estritamente em JSON conforme o schema especificado.`;

	const response = await ai.models.generateContent({
		model: "gemini-3.5-flash-lite",
		contents: [systemInstruction],
		config: {
			responseMimeType: "application/json",
			responseSchema: responseSchema,
			temperature: 0.2, // low temp for consistent structured outputs
		},
	});

	if (response.text) {
		return JSON.parse(response.text);
	}
	throw new Error("Resposta vazia da IA");
}

module.exports = {
	generateChecklistForPrompt
};
