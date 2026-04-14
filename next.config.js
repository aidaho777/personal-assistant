/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large payloads for Telegram webhook
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};

module.exports = nextConfig;
