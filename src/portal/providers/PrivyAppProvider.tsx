'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import type { ReactNode } from 'react'

export const PRIVY_APP_ID =
  (process.env.NEXT_PUBLIC_PRIVY_APP_ID || '').trim() ||
  (process.env.PRIVY_APP_ID || '').trim()

interface PrivyAppProviderProps {
  children: ReactNode
}

export function PrivyAppProvider({ children }: PrivyAppProviderProps) {
  if (!PRIVY_APP_ID) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p style={{ color: '#6e6e68' }}>PRIVY_APP_ID em falta</p>
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'github', 'discord', 'passkey'],
        appearance: {
          theme: '#F5F4EE',
          accentColor: '#4D5943',
          logo: '/brand/work4you-logo.png',
          landingHeader: 'Entrar na Work4You',
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'off' },
          solana: { createOnLogin: 'off' },
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
