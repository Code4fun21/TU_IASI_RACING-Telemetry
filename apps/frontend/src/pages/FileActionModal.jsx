import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CANDecoder } from "../services/CANDecoder";
import { CANDecoderV2 } from "../services/CANDecoder_V2"; // <-- Added V2 Import
import { api } from "../services/api";

export default function FileActionModal({ open, setOpen, session, onSuccess }) {
    const [isProcessing, setIsProcessing] = useState(false);
    
    // State to track if valid data is ready to view
    const [hasValidData, setHasValidData] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [trackData,setTrackData]=useState(null)
    const navigate = useNavigate();

    // 1. Check File Status on Open
    useEffect(() => {
        if (open && session?.decodedFileName) {
            setCheckingStatus(true);
            
            api.fetchJsonFile(session.decodedFileName)
                .then((data) => {
                    const isValidOldFormat = Array.isArray(data) && data.length > 0;
                    const isValidNewFormat = data && Array.isArray(data.rows) && data.rows.length > 0;

                    if (isValidOldFormat || isValidNewFormat) {
                        setHasValidData(true);
                    } else {
                        console.warn("Decoded file exists but is empty or invalid format.");
                        setHasValidData(false);
                    }
                })
                .catch((err) => {
                    console.warn("Decoded file not found or load error:", err);
                    setHasValidData(false);
                })
                .finally(() => setCheckingStatus(false));
        } else {
            setHasValidData(false);
            if (open) setCheckingStatus(false); 
        }
    }, [open, session]);

    if (!session) return null;

    // --- ACTION: VIEW ---
    const handleViewDecoded = async () => {
        setIsProcessing(true);
        try {
            console.log("Fetching decoded data:", session.decodedFileName);
            const decodedData = await api.fetchJsonFile(session.decodedFileName);
            
            navigate("/from-file", { state: { 
                fileData: decodedData, 
                session: session 
            }});
            
        } catch (err) {
            console.error("Failed to load decoded file:", err);
            alert("Error loading data. Please try re-decoding.");
        } finally {
            setIsProcessing(false);
            setOpen(false);
        }
    };

    // --- ACTION: DECODE ---
    // Added 'decoderVersion' parameter to switch between V1 and V2
    const handleDecodeAndSave = async (decoderVersion = 'v1') => {
        setIsProcessing(true);
        try {
            // 1. Download Raw CSV
            console.log("1. Downloading Raw:", session.csvFileName);
            const rawBlob = await api.downloadFile(session.csvFileName);
            
            const rawText = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsText(rawBlob);
            });

            // 2. Decoding
            console.log(`2. Decoding using ${decoderVersion.toUpperCase()}...`);
            const lines = rawText.split('\n');
            const decodedRows = [];
            const startIndex = lines[0].startsWith("timestamp") ? 1 : 0;

            // --- SWITCH DECODER BASED ON BUTTON CLICK ---
            const decoder = decoderVersion === 'v2' ? new CANDecoderV2() : new CANDecoder(); 
            
            try {
                // Wait for gates/coordinates to load BEFORE parsing
                const trackData = await api.getTrackById(session.trackId);
                setTrackData(trackData);
                console.log("Fresh data:", trackData);
                await decoder.setBaseCoordinates(trackData); 
            } catch (err) {
                console.warn("Track/Gates not found, proceeding without lap timing:", err);
            }

            // Loop through data
            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line[0] === "t") continue;
                
                const decodedObj = decoder.parse(line); 
                if (decodedObj) decodedRows.push(decodedObj);
            }

            if (decodedRows.length === 0) {
                throw new Error("Decoding resulted in empty data. Check your CAN Map.");
            }

            // --- Prepare the Combined Payload ---
            // 1. Get Lap Data from the decoder
            const gatesData = decoder.getGatesData();

            // 2. Wrap everything in one object
            const filePayload = {
                rows: decodedRows,     // The sensor data
                Gates_times: gatesData // The calculated lap times
            };

            // 3. Stringify the NEW payload (not just decodedRows)
            const jsonContent = JSON.stringify(filePayload); 
            
            // ----------------------------------------------

            const targetFileName = session.decodedFileName || session.csvFileName.replace(".csv", "_decoded.json");
            const jsonBlob = new Blob([jsonContent], { type: "application/json" });
            const jsonFile = new File([jsonBlob], targetFileName);

            console.log("3. Uploading to Bucket:", targetFileName);
            
            // Force overwrite
            await api.uploadFile(jsonFile, targetFileName);

            // 4. Update Database (only if needed)
            if (!session.decodedFileName) {
                console.log("4. Updating DB Metadata...");
                await api.updateSession(session.id, { decodedFileName: targetFileName });
            }

            alert(`Success! Decoded ${decodedRows.length} data points using ${decoderVersion.toUpperCase()}.`);
            
            setHasValidData(true);
            if (onSuccess) onSuccess();

        } catch (err) {
            console.error("Decoding Failed:", err);
            alert("Failed to decode file: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => !isProcessing && setOpen(false)} className="relative z-50">
            <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
            <div className="fixed inset-0 flex items-center justify-center p-4">
                <DialogPanel className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                    <DialogTitle className="text-lg font-bold text-gray-900 mb-4">
                        Session Action
                    </DialogTitle>
                    
                    <div className="mb-6 p-3 bg-gray-50 rounded border border-gray-200 text-sm">
                        <p className="text-gray-500 mb-1">Raw File:</p>
                        <p className="font-mono text-gray-800 break-all">{session.csvFileName}</p>
                    </div>

                    {checkingStatus ? (
                        <div className="py-8 text-center text-gray-500 flex flex-col items-center gap-2">
                            {/* Simple Loading Spinner */}
                            <div className="w-6 h-6 border-4 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                            Checking file status...
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            
                            {/* SCENARIO A: Valid Data Exists -> Show View AND Re-Decode Options */}
                            {hasValidData ? (
                                <>
                                    <button
                                        onClick={handleViewDecoded}
                                        disabled={isProcessing}
                                        className="w-full rounded-md bg-green-600 px-4 py-3 text-sm font-bold text-white shadow hover:bg-green-500 transition-colors flex justify-center items-center gap-2"
                                    >
                                        {isProcessing ? "Loading..." : "View Dashboard"}
                                    </button>
                                    
                                    <div className="relative flex py-2 items-center">
                                        <div className="flex-grow border-t border-gray-300"></div>
                                        <span className="flex-shrink-0 mx-2 text-gray-400 text-xs">OR RE-DECODE DATA</span>
                                        <div className="flex-grow border-t border-gray-300"></div>
                                    </div>

                                    {/* V1 Re-Decode Button */}
                                    <button
                                        onClick={() => handleDecodeAndSave('v1')}
                                        disabled={isProcessing}
                                        className="w-full rounded-md bg-white border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        {isProcessing ? "Processing..." : "Decode with Old Encoding (V1)"}
                                    </button>

                                    {/* V2 Re-Decode Button */}
                                    <button
                                        onClick={() => handleDecodeAndSave('v2')}
                                        disabled={isProcessing}
                                        className="w-full rounded-md bg-white border border-indigo-600 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
                                    >
                                        {isProcessing ? "Processing..." : "Decode with New ESP32 Encoding (V2)"}
                                    </button>
                                </>
                            ) : (
                                /* SCENARIO B: No Data -> Show Decode Only Options */
                                <div className="space-y-3">
                                    <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded text-center mb-4">
                                        ⚠️ Data has not been processed yet. Choose your encoding format:
                                    </div>
                                    
                                    {/* V1 Decode Button */}
                                    <button
                                        onClick={() => handleDecodeAndSave('v1')}
                                        disabled={isProcessing}
                                        className={`w-full rounded-md px-4 py-3 text-sm font-bold text-white shadow transition-colors
                                            ${isProcessing 
                                                ? 'bg-gray-400 cursor-wait' 
                                                : 'bg-gray-600 hover:bg-gray-500'
                                            }`}
                                    >
                                        {isProcessing ? "Processing..." : "Decode Old Format (V1)"}
                                    </button>

                                    {/* V2 Decode Button */}
                                    <button
                                        onClick={() => handleDecodeAndSave('v2')}
                                        disabled={isProcessing}
                                        className={`w-full rounded-md px-4 py-3 text-sm font-bold text-white shadow transition-colors
                                            ${isProcessing 
                                                ? 'bg-gray-400 cursor-wait' 
                                                : 'bg-indigo-600 hover:bg-indigo-500'
                                            }`}
                                    >
                                        {isProcessing ? "Processing..." : "Decode New Format (V2)"}
                                    </button>
                                </div>
                            )}

                            <button
                                onClick={() => setOpen(false)}
                                disabled={isProcessing}
                                className="mt-4 w-full rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </DialogPanel>
            </div>
        </Dialog>
    );
}