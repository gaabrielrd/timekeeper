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
	const systemInstruction = `Você é um assistente especializado em produtividade.
O usuário quer criar um contador de tempo (regressivo ou progressivo) para: "${promptText}".
A data atual é ${new Date().toISOString()}.
Seu objetivo é:
1. Extrair os parâmetros de data, horário ou recorrência da intenção do usuário e preencher 'counterParams', deduzindo se é fixo ou recorrente. Se nenhum for especificado, omita o 'counterParams'.
2. Gerar uma checklist (mini-checklists) de no máximo 5 etapas essenciais e curtas relacionadas a esse objetivo.
A checklist deve ser em português (Brasil).
O output deve ser estritamente em JSON de acordo com o schema especificado.`;

	const response = await ai.models.generateContent({
		model: "gemini-2.5-flash",
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
