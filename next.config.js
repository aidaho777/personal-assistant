/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large payloads for Telegram webhook (files up to 20 MB + overhead)
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },

  // Disable static page generation for API routes that need env vars at runtime
  // Individual routes also export `dynamic = "force-dynamic"` for safety
  
  // Suppress the punycode deprecation warning from googleapis
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.ignoreWarnings = [
        { module: /node_modules\/punycode/ },
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
