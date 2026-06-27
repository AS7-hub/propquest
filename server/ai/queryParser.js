const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

const SYSTEM_PROMPT = `
You are a UK property search query parser. 
Extract structured search parameters from natural language property queries.
Respond ONLY with a valid JSON object — no markdown, no explanation, no backticks.
Use null for any field the query does not mention.
Currency is always GBP (£). Prices in thousands: "500k" = 500000.
Bedroom synonyms: "bed", "bedroom", "BR", "BHK" all map to bedrooms.
Property type synonyms: "flat"/"apartment" → "flat", "house"/"home" → "detached" or infer.
Respond with this exact schema:
{"minPrice":null,"maxPrice":null,"minBedrooms":null,"maxBedrooms":null,"propertyTypes":[],"radiusKm":null,"locationHint":null,"keywords":[],"confidence":0.9}
`;

function regexFallback(query) {
  const result = {
    minPrice: null,
    maxPrice: null,
    minBedrooms: null,
    maxBedrooms: null,
    propertyTypes: [],
    radiusKm: null,
    locationHint: null,
    keywords: [],
    confidence: 0.4
  };

  const lowerQuery = query.toLowerCase();

  // Extract beds: "3 bed", "2-3 bedrooms", "4BHK"
  const bedMatch = lowerQuery.match(/(?:(\d+)\s*(?:-|to)\s*)?(\d+)\s*(?:bed|bedroom|br|bhk)/i);
  if (bedMatch) {
    if (bedMatch[1]) {
      result.minBedrooms = parseInt(bedMatch[1], 10);
      result.maxBedrooms = parseInt(bedMatch[2], 10);
    } else {
      result.minBedrooms = parseInt(bedMatch[2], 10);
      result.maxBedrooms = result.minBedrooms;
    }
  }

  // Extract prices (under)
  const underPriceMatch = lowerQuery.match(/(?:under|<)\s*£?\s*(\d+(?:\.\d+)?)\s*(k|m|000)?/i);
  if (underPriceMatch) {
    let multiplier = 1;
    if (underPriceMatch[2]) {
      if (underPriceMatch[2].toLowerCase() === 'k') multiplier = 1000;
      if (underPriceMatch[2].toLowerCase() === 'm') multiplier = 1000000;
    }
    result.maxPrice = parseFloat(underPriceMatch[1]) * multiplier;
    // Normalize "500" if we assume thousands for real estate
    if (result.maxPrice < 10000 && multiplier === 1) result.maxPrice *= 1000;
  }

  // Extract prices (over)
  const overPriceMatch = lowerQuery.match(/(?:over|>)\s*£?\s*(\d+(?:\.\d+)?)\s*(k|m|000)?/i);
  if (overPriceMatch) {
    let multiplier = 1;
    if (overPriceMatch[2]) {
      if (overPriceMatch[2].toLowerCase() === 'k') multiplier = 1000;
      if (overPriceMatch[2].toLowerCase() === 'm') multiplier = 1000000;
    }
    result.minPrice = parseFloat(overPriceMatch[1]) * multiplier;
    if (result.minPrice < 10000 && multiplier === 1) result.minPrice *= 1000;
  }

  if (lowerQuery.includes('flat') || lowerQuery.includes('apartment')) result.propertyTypes.push('flat');
  if (lowerQuery.includes('house') || lowerQuery.includes('detached')) result.propertyTypes.push('detached');
  if (lowerQuery.includes('terraced')) result.propertyTypes.push('terraced');
  if (lowerQuery.includes('semi-detached') || lowerQuery.includes('semi')) result.propertyTypes.push('semi-detached');

  return result;
}

async function parseWithLLM(query) {
  const provider = process.env.AI_PROVIDER || 'gemini';

  try {
    let jsonText = '';

    if (provider.toLowerCase() === 'openai') {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
      
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: query }
        ],
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' }
      });
      
      jsonText = completion.choices[0].message.content;
      
    } else {
      // Default to Gemini
      if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
      
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 200,
          responseMimeType: 'application/json'
        },
        systemInstruction: SYSTEM_PROMPT
      });
      
      const result = await model.generateContent(query);
      jsonText = result.response.text();
    }

    // Clean up potential markdown formatting if the model ignored instructions
    jsonText = jsonText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    return JSON.parse(jsonText);
  } catch (error) {
    console.warn(`[queryParser] LLM Parse failed (${error.message}). Using regex fallback.`);
    return regexFallback(query);
  }
}

async function parseWithFallback(query) {
  if (!query || typeof query !== 'string') return regexFallback('');
  
  console.log(`[NLP] ${new Date().toISOString()} query="${query.slice(0,50)}" provider=${process.env.AI_PROVIDER}`);
  
  return await parseWithLLM(query);
}

module.exports = {
  parseQuery: parseWithFallback,
  regexFallback
};
