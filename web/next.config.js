/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true,
  },
  basePath: '/iamx',
  // 14/11/69 (security): ไม่บอกว่าใช้ Next.js · header ความปลอดภัยทุกหน้า
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
      ],
    }];
  },
  images: {
    remotePatterns: [],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  },
  // 13/11/69: หน้าเก่าที่ไม่มีทางเข้าจากเมนูแล้ว พาไปหน้าใหม่ที่ทำหน้าที่เดียวกัน
  async redirects() {
    const to = (from, dest) => ({ source: from, destination: dest, permanent: false });
    return [
      // เปิด localhost:3010/ ตรง ๆ (นอก basePath) ให้เข้า IAM-X แทนหน้า 404
      { source: '/', destination: '/iamx/settings', basePath: false, permanent: false },
      to('/settings/rules/:path*', '/settings'),
      to('/settings/grind/:path*', '/settings'),
      to('/settings/manageMenu/:path*', '/settings/structure'),
      to('/settings/systemObject/:path*', '/settings/structure'),
      to('/settings/object/:path*', '/settings/structure'),
      to('/settings/module/:path*', '/settings/structure'),
      to('/settings/manage-permission/:path*', '/settings/access'),
      to('/settings/role-mapping/:path*', '/settings/access'),
      to('/settings/permissions/:path*', '/settings/access'),
      to('/settings/rightsType/:path*', '/settings/general'),
      to('/settings/responsibility-data-access/:path*', '/settings/responsibility'),
      to('/settings/userInfo/:path*', '/settings/users'),
      // 14/11/69: หน้าที่ไม่อยู่ในเมนูแล้ว (ขั้นดำเนินการอยู่ในลิ้นชักของโครงสร้างเมนู · สิทธิ์รายงานอยู่ในแท็บรายงานของบทบาท)
      to('/settings/process/:path*', '/settings/structure'),
      to('/settings/report-mapping', '/settings/access'),
    ];
  },
  async rewrites() {
    const chatBase = (process.env.CHAT_API_BASE || 'http://localhost:8081/chat-service/chat/group/api')
      .replace(/\/chat-service\/.*$/, '');
    return [
      {
        // 13/11/69: basePath:false — หน้าเว็บเรียก /chat-service ตรง (ไม่มี /iamx นำหน้า) · UAT/PROD ingress ส่งไป chat service เอง ส่วนนี้ใช้ตอนรันในเครื่อง
        source: '/chat-service/:path*',
        basePath: false,
        destination: `${chatBase}/chat-service/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
