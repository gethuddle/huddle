export type SupabaseAuthConfigPayload = Readonly<{
  site_url: string;
  uri_allow_list: string;
  mailer_autoconfirm: boolean;
  mailer_secure_email_change_enabled: boolean;
  mailer_subjects_email_change: string;
  mailer_templates_email_change_content: string;
  password_min_length: number;
  password_required_characters: string;
  rate_limit_email_sent: number;
  security_update_password_require_reauthentication: boolean;
  mailer_notifications_password_changed_enabled: boolean;
  mailer_subjects_confirmation: string;
  mailer_subjects_recovery: string;
  mailer_subjects_password_changed_notification: string;
  mailer_templates_confirmation_content: string;
  mailer_templates_recovery_content: string;
  mailer_templates_password_changed_notification_content: string;
}>;

export function buildAuthConfigPayload(siteUrl: string): SupabaseAuthConfigPayload;
export function resolveAuthConfigTarget(
  environment: Readonly<Record<string, string | undefined>>,
): {
  environment: "preview" | "production";
  projectRef: string;
  siteUrl: string;
};
export function authConfigDrift(
  current: Readonly<Record<string, unknown>>,
  desired: SupabaseAuthConfigPayload,
): string[];
export function sanitizeConfigError(operation: string, status: number): string;
