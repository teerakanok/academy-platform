'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface CourseRow {
  slug: string
  staticAvailability: string
  effectiveVisibility: string
  overridden: boolean
  title: string
  titleOverride: string | null
  subtitle: string
  subtitleOverride: string | null
  lessonCount: number
  editedAt: string | null
}

const VISIBILITY_LABEL: Record<string, string> = {
  published: 'Published',
  unpublished: 'Unpublished',
  retired: 'Retired',
}

const VISIBILITY_STYLE: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-800',
  unpublished: 'bg-slate-100 text-slate-600',
  retired: 'bg-red-100 text-red-700',
}

export default function CourseManagementPage() {
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSubtitle, setEditSubtitle] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const r = await fetch('/api/admin/courses', { credentials: 'same-origin', cache: 'no-store' })
      if (!r.ok) throw new Error()
      const v = await r.json()
      setCourses(v.courses ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const patch = async (slug: string, body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/admin/courses/${slug}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error()
      await load()
      setEditing(null)
    } catch {
      alert('บันทึกไม่สำเร็จ โปรดลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  const retire = async (slug: string) => {
    if (!confirm(`ถอนคอร์ส "${slug}" ออกจากระบบ?\n\nผู้เรียนจะไม่เห็นคอร์สนี้อีก (สามารถกลับมาได้โดยตั้งเป็น Published)`)) return
    setBusy(true)
    try {
      const r = await fetch(`/api/admin/courses/${slug}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      if (!r.ok) throw new Error()
      await load()
    } catch {
      alert('ถอนคอร์สไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (course: CourseRow) => {
    setEditing(course.slug)
    setEditTitle(course.titleOverride ?? course.title)
    setEditSubtitle(course.subtitleOverride ?? course.subtitle)
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-center text-cs-muted">กำลังโหลดรายการคอร์ส…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-semibold text-red-700">ไม่สามารถโหลดรายการคอร์สได้</p>
          <p className="mt-1 text-sm text-red-600">ต้องเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์ owner</p>
        </div>
      </main>
    )
  }

  const published = courses.filter((c) => c.effectiveVisibility === 'published').length
  const unpublished = courses.filter((c) => c.effectiveVisibility === 'unpublished').length
  const retired = courses.filter((c) => c.effectiveVisibility === 'retired').length

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-cs-text">Course Management</h1>
          <p className="mt-1 text-sm text-cs-muted">
            {courses.length} courses · {published} published · {unpublished} unpublished · {retired} retired
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-control border border-cs-border px-4 py-2 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="space-y-3">
        {courses.map((course) => (
          <div
            key={course.slug}
            className={`rounded-xl border p-5 transition-all ${
              course.effectiveVisibility === 'retired'
                ? 'border-red-200 bg-red-50/50 opacity-75'
                : 'border-cs-border bg-cs-surface shadow-sm'
            }`}
          >
            {editing === course.slug ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-cs-text">Title</label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-control border border-cs-border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-cs-text">Subtitle</label>
                  <textarea
                    value={editSubtitle}
                    onChange={(e) => setEditSubtitle(e.target.value)}
                    rows={2}
                    className="w-full rounded-control border border-cs-border px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => patch(course.slug, {
                      title: editTitle !== course.title ? editTitle : null,
                      subtitle: editSubtitle !== course.subtitle ? editSubtitle : null,
                    })}
                    disabled={busy}
                    className="rounded-control bg-cs-accent-fill px-4 py-2 text-sm font-semibold text-cs-on-accent disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="rounded-control border border-cs-border px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold ${course.effectiveVisibility === 'retired' ? 'text-red-700 line-through' : 'text-cs-text'}`}>
                      {course.title}
                    </h3>
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${VISIBILITY_STYLE[course.effectiveVisibility] ?? 'bg-slate-100'}`}>
                      {VISIBILITY_LABEL[course.effectiveVisibility] ?? course.effectiveVisibility}
                    </span>
                    {course.overridden && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        overridden
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-cs-muted">{course.subtitle}</p>
                  <p className="mt-1 font-mono text-xs text-cs-muted">
                    {course.slug} · {course.lessonCount} lessons · static: {course.staticAvailability}
                    {course.editedAt && ` · edited ${course.editedAt.slice(0, 10)}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {course.effectiveVisibility !== 'retired' && (
                    <>
                      <button
                        onClick={() => startEdit(course)}
                        disabled={busy}
                        className="rounded-control border border-cs-border px-3 py-1.5 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
                      >
                        Edit
                      </button>
                      <a
                        href={`/courses/${course.slug}/en`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-control border border-cs-border px-3 py-1.5 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
                      >
                        Student view ↗
                      </a>
                      {course.effectiveVisibility === 'published' ? (
                        <button
                          onClick={() => patch(course.slug, { visibility: 'unpublished' })}
                          disabled={busy}
                          className="rounded-control border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 transition-colors hover:bg-amber-100"
                        >
                          Unpublish
                        </button>
                      ) : (
                        <button
                          onClick={() => patch(course.slug, { visibility: 'published' })}
                          disabled={busy}
                          className="rounded-control border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        onClick={() => retire(course.slug)}
                        disabled={busy}
                        className="rounded-control border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-100"
                      >
                        Retire
                      </button>
                    </>
                  )}
                  {course.effectiveVisibility === 'retired' && (
                    <button
                      onClick={() => patch(course.slug, { visibility: 'published' })}
                      disabled={busy}
                      className="rounded-control border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      Restore
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
