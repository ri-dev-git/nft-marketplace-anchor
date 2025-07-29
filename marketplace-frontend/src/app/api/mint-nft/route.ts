// File: /src/app/api/mint-nft/route.ts

import { NextRequest, NextResponse } from "next/server";
import { pinata } from "@/utils/config";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const name = formData.get("name") as string;
        const symbol = formData.get("symbol") as string;
        const description = formData.get("description") as string;
        const file = formData.get("file") as Blob | null;

        if (!name || !symbol || !file || !description) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Upload image to IPFS
        const imageUri = await uploadFileToPinata(file as any);
        const metadataUri = await uploadMetadataToPinata(name, symbol, description, imageUri, file.type);

        return NextResponse.json({
            success: true,
            imageUri,
            metadataUri,
        });

    } catch (error) {
        console.error("Error handling NFT upload:", error);
        return NextResponse.json({ error: "Failed to process NFT upload" }, { status: 500 });
    }
}


// Upload file to IPFS via Pinata
const uploadFileToPinata = async (file: File): Promise<string> => {
    if (!file) throw new Error("No file selected");

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${uuidv4()}-${Date.now()}`;
    const fileObject = new File([buffer], fileName);
    const upload = await pinata.upload.public.file(fileObject);
    return `https://white-swift-boar-963.mypinata.cloud/ipfs/${upload.cid}`;
};


// Upload metadata JSON to IPFS via Pinata directly
async function uploadMetadataToPinata(
    name: string,
    symbol: string,
    description: string,
    imageUri: string,
    fileType: string
): Promise<string> {
    const metadata = {
        name,
        symbol,
        description,
        image: imageUri,
        attributes: [],
        properties: {
            files: [{ uri: imageUri, type: fileType }],
            category: "image",
        },
        creators: null,
        seller_fee_basis_points: 0,
    };

    const blob = new Blob([JSON.stringify(metadata)], { type: "application/json" });
    const buffer = Buffer.from(await blob.arrayBuffer());
    const fileName = `${uuidv4()}-metadata.json`;
    const fileObject = new File([buffer], fileName, { type: "application/json" });
    const upload = await pinata.upload.public.file(fileObject);
    return `https://white-swift-boar-963.mypinata.cloud/ipfs/${upload.cid}`;
}
