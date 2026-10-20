import crypto from "node:crypto";
export class GmailProvider {
  constructor(env = process.env) {
    this.env = env;
    this.lastSend = 0;
  }
  get configured() {
    return [
      "GMAIL_SENDER",
      "GMAIL_CLIENT_ID",
      "GMAIL_CLIENT_SECRET",
      "GMAIL_REFRESH_TOKEN",
    ].every((k) => this.env[k]);
  }
  async send({ email, subject, body, messageId }) {
    if (!this.configured)
      throw Object.assign(new Error("Gmail credentials are missing."), {
        code: "PROVIDER_NOT_CONFIGURED",
        retryable: true,
      });
    if (/[\r\n]/.test(email + this.env.GMAIL_SENDER))
      throw Object.assign(new Error("Invalid mail address."), {
        code: "INVALID_ADDRESS",
      });
    if (!this.accessToken || this.tokenExpires < Date.now()) {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: this.env.GMAIL_CLIENT_ID,
          client_secret: this.env.GMAIL_CLIENT_SECRET,
          refresh_token: this.env.GMAIL_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw Object.assign(new Error("Gmail OAuth authorization failed."), {
          code: "GMAIL_AUTH",
          retryable: response.status >= 500 || response.status === 429,
        });
      const token = await response.json();
      this.accessToken = token.access_token;
      this.tokenExpires = Date.now() + (token.expires_in - 60) * 1000;
    }
    const delay = Math.max(
      0,
      this.lastSend +
        Number(this.env.GMAIL_MIN_INTERVAL_MS || 1000) -
        Date.now(),
    );
    if (delay) await new Promise((r) => setTimeout(r, delay));
    this.lastSend = Date.now();
    const mime = [
      `From: ${this.env.GMAIL_SENDER}`,
      `To: ${email}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      `Message-ID: <${messageId}@nexvia.local>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(body).toString("base64"),
    ].join("\r\n");
    let response;
    try {
      response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            raw: Buffer.from(mime).toString("base64url"),
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      throw Object.assign(new Error("Gmail acceptance is unknown."), {
        code: "GMAIL_UNKNOWN",
        unknown: true,
      });
    }
    if (!response.ok)
      throw Object.assign(new Error("Gmail rejected the message."), {
        code: `GMAIL_${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      });
    let accepted;
    try {
      accepted = await response.json();
      if (!accepted.id) throw new Error("Missing provider identifier.");
    } catch {
      throw Object.assign(new Error("Gmail acceptance is unknown."), {
        code: "GMAIL_UNKNOWN",
        unknown: true,
      });
    }
    return { providerMessageId: accepted.id, status: "provider_accepted" };
  }
}
