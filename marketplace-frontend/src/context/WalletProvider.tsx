'use client'
import { solana, solanaTestnet, solanaDevnet } from '@reown/appkit/networks'
import { solanaWeb3JsAdapter, networks } from '../config'
import { createAppKit } from '@reown/appkit/react'
import React, { type ReactNode } from 'react'

// Set up metadata
const metadata = {
    name: 'next-reown-appkit',
    description: 'next-reown-appkit',
    url: 'https://github.com/0xonerb/next-reown-appkit-ssr', // origin must match your domain & subdomain
    icons: ['https://avatars.githubusercontent.com/u/179229932']
}

// Create the modal
export const modal = createAppKit({
    adapters: [solanaWeb3JsAdapter],
    projectId:`${process.env.NEXT_PUBLIC_PROJECT_ID}`, // Ensure this is set in your environment variables
    networks: networks,
    metadata: {
        name: 'NFT Marketplace',
        description: 'NFT Marketplace on Solana',
        url: 'https://your-marketplace.com', // Update with your URL
        icons: ['https://your-marketplace.com/icon.png'] // Update with your icon
    },

    themeMode: 'dark',
    features: {
        analytics: true // Optional - defaults to your Cloud configuration
    },
    themeVariables: {
        '--w3m-accent': '#000000',
    }
})

function ContextProvider({ children }: { children: ReactNode }) {
    return (
        <>{children}</>
    )
}

export default ContextProvider