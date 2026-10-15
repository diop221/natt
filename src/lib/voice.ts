// Synthèse vocale en wolof pour les messages vocaux WhatsApp.
// Natt n'embarque pas de modèle : VOICE_TTS_URL désigne un service qui reçoit
// { text, language: "wol" } en JSON et renvoie le fichier audio (de préférence audio/ogg, codec opus,
// pour qu'il s'affiche comme une note vocale). On peut y brancher par exemple un modèle
// libre comme MMS-TTS de Meta (langue « wol »), après avoir validé la qualité avec des locuteurs.

export async function synthesizeWolof(text: string): Promise<{ audio: Blob; mimeType: string }> {
  const url = process.env.VOICE_TTS_URL;
  if (!url) throw new Error("Synthèse vocale non configurée (VOICE_TTS_URL)");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.VOICE_TTS_TOKEN && { Authorization: `Bearer ${process.env.VOICE_TTS_TOKEN}` }),
    },
    body: JSON.stringify({ text, language: "wol" }),
  });
  if (!res.ok) throw new Error(`Synthèse vocale HTTP ${res.status}`);
  const mimeType = (res.headers.get("content-type") ?? "audio/ogg").split(";")[0];
  return { audio: await res.blob(), mimeType };
}
