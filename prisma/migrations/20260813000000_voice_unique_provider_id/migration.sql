-- One library entry per engine voice — guards concurrent double-imports.
CREATE UNIQUE INDEX "Voice_provider_providerVoiceId_key" ON "Voice"("provider", "providerVoiceId");
