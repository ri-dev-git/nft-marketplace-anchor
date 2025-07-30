import { solana, solanaTestnet, solanaDevnet } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react'



export const networks = [solanaDevnet] as [AppKitNetwork, ...AppKitNetwork[]]

// Set up Solana Adapterded
export const solanaWeb3JsAdapter = new SolanaAdapter()