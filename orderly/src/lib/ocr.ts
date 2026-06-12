import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ORDERLY_AGENT_MODEL ?? "claude-opus-4-8";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/**
 * OCR / text extraction via Claude's native document & vision understanding.
 * Accepts an image (jpeg/png/gif/webp) or a PDF as base64 and returns the
 * transcribed text, ready to feed to the Documents agent for classification.
 */
export async function extractText(base64: string, mediaType: string): Promise<string> {
  const isPdf = mediaType === "application/pdf";
  if (!isPdf && !IMAGE_TYPES.includes(mediaType)) {
    throw new Error(`Unsupported file type for OCR: ${mediaType}`);
  }

  const fileBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          fileBlock as any,
          {
            type: "text",
            text:
              "Transcribe ALL text content from this document verbatim, preserving line breaks, " +
              "amounts, dates and tabular structure as best you can. Output only the transcribed text, no commentary.",
          },
        ],
      },
    ],
  });

  return res.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
}
