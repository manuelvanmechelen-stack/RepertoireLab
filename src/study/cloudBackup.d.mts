export function validateCloudBackupPayload<T = unknown>(raw: T): T;

export type CloudBackupRequest = (
  path: string,
  init?: RequestInit,
  token?: string,
) => Promise<unknown>;

export function syncCloudBackup(args: {
  payload: unknown;
  userId: string;
  expectedUpdatedAt?: string | null;
  request: CloudBackupRequest;
  token?: string;
  now?: () => string;
}): Promise<{ created: boolean; updatedAt: string }>;
