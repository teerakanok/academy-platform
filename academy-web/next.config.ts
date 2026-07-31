import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Security baseline: ไม่มี external resource ใน CSP scope ของ app นี้ —
  // fonts ผ่าน next/font (self-hosted ตอน build), ไม่มี third-party script
  poweredByHeader: false,
}

export default nextConfig
