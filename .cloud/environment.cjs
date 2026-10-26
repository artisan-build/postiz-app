const env = process.env;

env.NODE_ENV = 'production';
if (env.APP_URL) env.MAIN_URL ||= env.APP_URL;
if (env.MAIN_URL) {
  env.FRONTEND_URL ||= env.MAIN_URL;
  env.NEXT_PUBLIC_BACKEND_URL ||= `${env.MAIN_URL}/api`;
}
env.BACKEND_INTERNAL_URL = 'http://127.0.0.1:3001';
env.TEMPORAL_ADDRESS = '127.0.0.1:7233';
env.TEMPORAL_NAMESPACE = 'default';
env.TEMPORAL_TLS = 'false';
env.IS_GENERAL = 'true';
env.DISABLE_REGISTRATION ||= 'true';
env.EMAIL_PROVIDER = 'resend';
if (env.MAIL_FROM_ADDRESS) env.EMAIL_FROM_ADDRESS ||= env.MAIL_FROM_ADDRESS;
if (env.MAIL_FROM_NAME) env.EMAIL_FROM_NAME ||= env.MAIL_FROM_NAME;

if (env.AWS_BUCKET) {
  const endpoint = new URL(env.AWS_ENDPOINT_URL);
  // Cloud can inject a bucket-qualified endpoint; the SDK adds the bucket itself.
  if (endpoint.hostname.startsWith(`${env.AWS_BUCKET}.`)) {
    endpoint.hostname = endpoint.hostname.slice(env.AWS_BUCKET.length + 1);
  }
  env.STORAGE_PROVIDER = 'cloudflare';
  env.CLOUDFLARE_ENDPOINT = endpoint.origin;
  env.CLOUDFLARE_ACCOUNT_ID = endpoint.hostname.split('.')[0];
  env.CLOUDFLARE_ACCESS_KEY = env.AWS_ACCESS_KEY_ID;
  env.CLOUDFLARE_SECRET_ACCESS_KEY = env.AWS_SECRET_ACCESS_KEY;
  env.CLOUDFLARE_REGION = env.AWS_REGION || 'auto';
  env.CLOUDFLARE_BUCKETNAME = env.AWS_BUCKET;
  if (env.AWS_URL) env.CLOUDFLARE_BUCKET_URL ||= env.AWS_URL;
}

if (env.DATABASE_URL) {
  const database = new URL(env.DATABASE_URL);
  database.searchParams.delete('serverVersion');
  env.DATABASE_URL = database.toString();
  env.TEMPORAL_PG_HOST ||= database.hostname;
  env.TEMPORAL_PG_PORT = database.port || '5432';
  env.TEMPORAL_PG_DATABASE ||= 'temporal';
  env.TEMPORAL_PG_VISIBILITY_DATABASE ||= 'temporal_visibility';
  env.TEMPORAL_PG_USER = decodeURIComponent(database.username);
  env.TEMPORAL_PG_PASSWORD = decodeURIComponent(database.password);
  env.TEMPORAL_PG_TLS = String(database.searchParams.get('sslmode') !== 'disable');
}
