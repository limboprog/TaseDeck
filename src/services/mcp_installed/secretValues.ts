export function looksMaskedSecretValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.includes("...") && !trimmed.startsWith("enc:");
}

export function isMaskedSecretSaveError(message: string): boolean {
  return message.toLowerCase().includes("masked secret");
}
