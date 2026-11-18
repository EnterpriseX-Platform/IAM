'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface AboutData {
  app: string
  version: string
  backend: string
  features: string[]
}

export default function About() {
  const [about, setAbout] = useState<AboutData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAbout = async () => {
      try {
        setLoading(true)
        const apiUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080'
        const response = await fetch(`${apiUrl}/iamx/api/about`)
        const data = await response.json()
        setAbout(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch about data')
        setAbout(null)
      } finally {
        setLoading(false)
      }
    }

    fetchAbout()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-indigo-600">My App</h1>
            <div className="flex gap-4">
              <Link
                href="/"
                className="px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-600 rounded-lg hover:bg-indigo-50 transition"
              >
                Home
              </Link>
              <Link
                href="/about"
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
              >
                About
              </Link>
              <Link
                href="/contact"
                className="px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-600 rounded-lg hover:bg-indigo-50 transition"
              >
                Contact
              </Link>
              <Link
                href="/dataSystem"
                className="px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-600 rounded-lg hover:bg-indigo-50 transition"
              >
                Data System
              </Link>
              <Link
                href="/categoryPermission"
                className="px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-600 rounded-lg hover:bg-indigo-50 transition"
              >
                Category Permission
              </Link>
              <Link
                href="/roleManagement"
                className="px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-600 rounded-lg hover:bg-indigo-50 transition"
              >
                Role Management
              </Link>
            </div>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="mb-12">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">About Us</h2>
          <p className="text-xl text-gray-600">
            Learn more about our application and the technologies behind it.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 p-8 rounded-lg border border-red-200">
            <p className="text-red-700 font-medium">Error: {error}</p>
          </div>
        ) : about ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* About Card */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">{about.app}</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 font-semibold">Version</p>
                  <p className="text-lg text-gray-900 font-medium">{about.version}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-semibold">Backend</p>
                  <p className="text-lg text-gray-900 font-medium">{about.backend}</p>
                </div>
                <div className="pt-4">
                  <p className="text-sm text-gray-500 font-semibold mb-2">Framework</p>
                  <p className="text-lg text-gray-900 font-medium">Next.js 14</p>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Key Features</h3>
              <ul className="space-y-3">
                {about.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <span className="flex-shrink-0 h-6 w-6 text-indigo-600 mr-3 flex items-center justify-center">
                      ✓
                    </span>
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {/* Technology Stack */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-lg shadow-md p-8 hover:shadow-lg transition">
            <h4 className="text-xl font-bold text-gray-900 mb-3">Frontend</h4>
            <ul className="text-gray-600 space-y-2">
              <li>• Next.js 14</li>
              <li>• TypeScript</li>
              <li>• Tailwind CSS</li>
              <li>• React 18</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow-md p-8 hover:shadow-lg transition">
            <h4 className="text-xl font-bold text-gray-900 mb-3">Backend</h4>
            <ul className="text-gray-600 space-y-2">
              <li>• Go 1.21</li>
              <li>• Gorilla Mux</li>
              <li>• RESTful API</li>
              <li>• CORS Enabled</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow-md p-8 hover:shadow-lg transition">
            <h4 className="text-xl font-bold text-gray-900 mb-3">Deployment</h4>
            <ul className="text-gray-600 space-y-2">
              <li>• Docker</li>
              <li>• Docker Compose</li>
              <li>• Supervisord</li>
              <li>• Production Ready</li>
            </ul>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center text-gray-600">
            <p>&copy; 2026 My App. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
