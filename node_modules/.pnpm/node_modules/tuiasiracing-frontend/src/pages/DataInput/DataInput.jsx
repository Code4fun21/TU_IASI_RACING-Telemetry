import { PhotoIcon, UserCircleIcon } from "@heroicons/react/24/solid";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import AddNewDriver from "./AddNewDriver";
import AddMonopost from "./AddMonopost";
import DriversTable from "./Tables/DriverTable";
import MonopostsTable from "./Tables/MonopostTable";
import TimestampsTable from "./Tables/TimestampsTable"; // <-- NEW

export default function DataInput() {
    return (
        <div className="divide-y divide-gray-900/10 ">
            {/* Monopost Add Form */}
            <AddMonopost />

            {/* Drivers */}
            <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                    <DriversTable />
                </div>
            </div>

            {/* Monoposts */}
            <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg mt-6">
                <div className="px-4 py-5 sm:p-6">
                    <MonopostsTable />
                </div>
            </div>

           
        </div>
    );
}
