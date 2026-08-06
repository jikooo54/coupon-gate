import { defineChain } from "viem";
export const GENLAYER_CHAIN_ID = 61999;
export const GENLAYER_RPC_URL = "https://studio.genlayer.com/api";
export const GENLAYER_NETWORK = "studionet" as const;
export const CONTRACT_ADDRESS = "0xC4aa3F6a75Cdc19c94d102Dc6bb3852e204430F9" as const;
export const genLayerStudionet = defineChain({ id: GENLAYER_CHAIN_ID, name: "GenLayer Studionet", nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 }, rpcUrls: { default: { http: [GENLAYER_RPC_URL] }, public: { http: [GENLAYER_RPC_URL] } }, testnet: true });
