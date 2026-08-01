'use client'

import type { SimulationState } from '@/lib/simulation/types'

// หน้าจอตั้งค่า IPv4 ของการ์ดเครือข่าย — จำลองหน้าที่คนทำงานเห็นจริง
//
// ตั้งใจให้หน้าตา "จริงจัง" ไม่ใช่การ์ตูน เพราะประโยชน์ทั้งหมดอยู่ที่ความคุ้นเคย:
// วันที่ไปเจอของจริง ต้องรู้สึกว่าเคยเห็นมาก่อน ไม่ใช่เห็นของเล่นที่หน้าตาไม่เหมือน
//
// พฤติกรรมที่ต้องเหมือนของจริง และเป็นตัวสอนเองด้วย:
//   · เลือก "รับอัตโนมัติ" แล้วช่องกรอกจะถูกปิด — ผู้เรียนเห็นกับตาว่าทำไมสองอย่างนี้
//     อยู่ด้วยกันไม่ได้ ซึ่งอ่านสิบบรรทัดก็ไม่ชัดเท่า
//   · กด Apply ตอนเป็น DHCP แล้วเลขโผล่มาเอง = เห็นว่า "ได้มาจากที่อื่น" จริงๆ
//   · กรอกไม่ครบตอน static แล้วยังกด Apply ได้ แต่ผลลัพธ์ไม่ผ่านเงื่อนไข —
//     เหมือนของจริงที่ระบบไม่ห้ามคุณตั้งค่าผิด

const LEASED = {
  ipv4: '10.20.4.117',
  subnet: '255.255.255.0',
  gateway: '10.20.4.1',
  dns1: '10.20.4.1',
}

function Field({
  label,
  name,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  label: string
  name: string
  value: string
  disabled: boolean
  placeholder?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={`sim-${name}`} className="w-[10.5rem] shrink-0 text-right text-[13px] text-cs-body">
        {label}
      </label>
      <input
        id={`sim-${name}`}
        data-testid={`sim-${name}`}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[3px] border border-cs-border-2 bg-cs-surface px-2 py-1 font-mono text-[13px] text-cs-text outline-none transition-colors focus:border-cs-accent disabled:cursor-not-allowed disabled:bg-cs-surface-2 disabled:text-cs-muted"
      />
    </div>
  )
}

export function NetworkInterfaceSim({
  state,
  onChange,
  readOnly = false,
}: {
  state: SimulationState
  onChange: (next: SimulationState) => void
  readOnly?: boolean
}) {
  const mode = (state.addressMode as string) ?? 'dhcp'
  const isStatic = mode === 'static'
  const applied = state.applied === true

  const set = (patch: SimulationState) => {
    if (readOnly) return
    onChange({ ...state, ...patch })
  }

  const str = (k: string) => (state[k] as string) ?? ''

  // เลือก DHCP แล้วกด Apply → ค่าที่ "ได้มาจากเซิร์ฟเวอร์" โผล่ในช่องที่ถูกปิดไว้
  const shown = (k: keyof typeof LEASED) => (!isStatic && applied ? LEASED[k] : isStatic ? str(k) : '')

  return (
    <div
      className="not-prose rounded-[6px] border border-cs-border-2 bg-cs-surface-2 shadow-card"
      data-testid="sim-network-interface"
    >
      {/* แถบหัวหน้าต่าง — สัญญาณว่านี่คือ "กล่องตั้งค่า" ไม่ใช่ฟอร์มบนเว็บ */}
      <div className="flex items-center justify-between rounded-t-[6px] border-b border-cs-border-2 bg-cs-surface px-4 py-2.5">
        <p className="font-display text-[13px] font-semibold text-cs-text">
          Internet Protocol Version 4 (TCP/IPv4) Properties
        </p>
        <span aria-hidden="true" className="font-mono text-xs text-cs-muted">
          ✕
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        <p className="text-[12.5px] leading-relaxed text-cs-muted">
          You can get IP settings assigned automatically if your network supports this capability. Otherwise, you need
          to ask your network administrator for the appropriate IP settings.
        </p>

        <fieldset className="space-y-2">
          <legend className="sr-only">IP address assignment</legend>
          {[
            ['dhcp', 'Obtain an IP address automatically'],
            ['static', 'Use the following IP address:'],
          ].map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-cs-text">
              <input
                type="radio"
                name="sim-address-mode"
                data-testid={`sim-mode-${value}`}
                checked={mode === value}
                disabled={readOnly}
                onChange={() => set({ addressMode: value, applied: false })}
                className="h-3.5 w-3.5 accent-[rgb(var(--cs-accent))]"
              />
              {label}
            </label>
          ))}
        </fieldset>

        <div className={`space-y-2 pl-6 ${isStatic ? '' : 'opacity-60'}`}>
          <Field
            label="IP address:"
            name="ipv4"
            value={shown('ipv4')}
            disabled={readOnly || !isStatic}
            placeholder={isStatic ? '' : '(assigned automatically)'}
            onChange={(v) => set({ ipv4: v })}
          />
          <Field
            label="Subnet mask:"
            name="subnet"
            value={shown('subnet')}
            disabled={readOnly || !isStatic}
            onChange={(v) => set({ subnet: v })}
          />
          <Field
            label="Default gateway:"
            name="gateway"
            value={shown('gateway')}
            disabled={readOnly || !isStatic}
            onChange={(v) => set({ gateway: v })}
          />
          <Field
            label="Preferred DNS server:"
            name="dns1"
            value={shown('dns1')}
            disabled={readOnly || !isStatic}
            onChange={(v) => set({ dns1: v })}
          />
        </div>

        <div className="flex items-center justify-between border-t border-cs-border pt-3">
          <p className="font-mono text-[11px] text-cs-muted" data-testid="sim-status">
            {isStatic
              ? applied
                ? 'Settings applied'
                : 'Not applied yet'
              : applied
                ? `Lease obtained from DHCP server ${LEASED.gateway}`
                : 'No address yet'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => set({ applied: false, ...(isStatic ? {} : {}) })}
              className="rounded-[3px] border border-cs-border-2 bg-cs-surface px-4 py-1.5 text-[13px] text-cs-body transition-colors hover:border-cs-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="sim-apply"
              disabled={readOnly}
              onClick={() => set({ applied: true })}
              className="rounded-[3px] border border-cs-accent bg-cs-accent-dim px-5 py-1.5 text-[13px] font-medium text-cs-accent transition-colors hover:bg-cs-surface disabled:opacity-50"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
