import { ApiTokens } from "@/components/app/api-tokens";

export const metadata = { title: "Account — Peakfinity Studio" };

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label-mono mb-2">Account</p>
        <h1 className="text-display text-3xl">API access</h1>
      </div>
      <ApiTokens baseUrl={process.env.APP_BASE_URL ?? "https://peakfinity-studio.onrender.com"} />
    </div>
  );
}
