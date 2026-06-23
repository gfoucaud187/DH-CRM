/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'soaemvmboawhjfzhhumi.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
