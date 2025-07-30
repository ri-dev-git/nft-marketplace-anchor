import { solana, solanaTestnet, solanaDevnet } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react'

// Get projectId from https://cloud.reown.com
export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID // this is a public projectId only to use on localhost

if (!projectId) {
    throw new Error('Project ID is not defined')
}

export const networks = [solanaDevnet] as [AppKitNetwork, ...AppKitNetwork[]]

// Set up Solana Adapterded
export const solanaWeb3JsAdapter = new SolanaAdapter()