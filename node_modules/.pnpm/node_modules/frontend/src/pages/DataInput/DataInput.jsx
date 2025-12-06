import { useState } from "react";
import AddMonopost from "./AddMonopost";
import AddNewDriver from "./AddNewDriver";
import DriversTable from "./Tables/DriverTable";
import MonopostsTable from "./Tables/MonopostTable";

export default function DataInput() {
    // 1. Separate State for EACH modal
    const [isMonopostOpen, setMonopostOpen] = useState(false);
    const [isDriverOpen, setDriverOpen] = useState(false);

    return (
        <div className="p-6 space-y-10 bg-gray-50 min-h-screen">
            
            {/* --- SECTION 1: DRIVERS --- */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Drivers Directory</h2>
                    {/* <button
                        onClick={() => setDriverOpen(true)}
                        className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        Add New Driver
                    </button> */}
                </div>
                
                <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg ring-1 ring-gray-900/5">
                    <div className="p-4 sm:p-6">
                        <DriversTable />
                    </div>
                </div>
            </div>

            {/* --- SECTION 2: MONOPOSTS --- */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Setup Configurations</h2>
                    {/* <button
                        onClick={() => setMonopostOpen(true)}
                        className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        Add New Monopost
                    </button> */}
                </div>

                <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg ring-1 ring-gray-900/5">
                    <div className="p-4 sm:p-6">
                        <MonopostsTable />
                    </div>
                </div>
            </div>

            {/* --- MODALS (Rendered at root level) --- */}
            {/* Pass the specific state to each specific component */}
            {/* <AddNewDriver open={isDriverOpen} setOpen={setDriverOpen} />
            <AddMonopost open={isMonopostOpen} setOpen={setMonopostOpen} /> */}

        </div>
    );
}