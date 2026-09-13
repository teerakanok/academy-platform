import { createRoot } from 'react-dom/client'
import { ConsentPreferences } from '@/components/account/ConsentPreferences'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import '@/app/globals.css'
const params = new URLSearchParams(location.search)
document.documentElement.dataset.theme = params.get('theme') ?? 'dark'
createRoot(document.getElementById('root')!).render(<LocaleProvider fixedLocale initialLocale={params.get('lang') === 'th' ? 'th' : 'en'}>
  <main className="mx-auto max-w-5xl px-6 py-12"><h1 className="text-2xl text-cs-text">Consent design fixture · synthetic data</h1><ConsentPreferences /></main>
</LocaleProvider>)
