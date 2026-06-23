/** @type {import('next').NextConfig} */
const nextConfig = {
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
