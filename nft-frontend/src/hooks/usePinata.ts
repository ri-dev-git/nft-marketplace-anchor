// import { useCallback } from "react";


// export function usePinata() {
//     const uploadFile = useCallback(async (file: File) => {
//         const res = await pinata.upload.public.file(file);
//         return `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}/ipfs/${res.cid}`;
//     }, []);

//     const uploadJSON = useCallback(async (json: any) => {
//         const res = await pinata.upload.public.json(json);
//         return `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}/ipfs/${res.cid}`;
//     }, []);

//     return { uploadFile, uploadJSON };
// }
