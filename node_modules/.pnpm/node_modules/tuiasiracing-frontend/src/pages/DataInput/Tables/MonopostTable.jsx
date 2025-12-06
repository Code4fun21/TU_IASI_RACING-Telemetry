import { useEffect, useState } from "react";
// import AddMonopost from "../AddMonopost";
import AddMonopost from "../AddMonopost";

import { api } from "../../../services/api";

export default function MonopostsTable() {
    const [monoposts, setMonoposts] = useState([]);
    const [isModalOpen, setModalOpen] = useState(false);
    const [selectedMonopost, setSelectedMonopost] = useState(null); // Holds data for editing

    // Fetch Data
    const fetchMonoposts = () => {
        api.getMonoposts()
            .then(res => setMonoposts(res || []))
            .catch(err => console.error("Failed to load monoposts", err));
    };

    useEffect(() => {
        fetchMonoposts();
    }, []);

    // Handle Delete (with confirmation)
    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this monopost?")) return;
        
        try {
            await api.deleteMonopost(id);
            // Remove from local state immediately to update UI fast
            setMonoposts(prev => prev.filter(m => m.id !== id));
        } catch (err) {
            if (err.response && err.response.status === 409) {
                alert("Cannot delete: This car is used in saved sessions.");
            } else {
                console.error("Delete failed:", err);
                alert("Failed to delete.");
            }
        }
    };

    // Handle Edit Click
    const handleEdit = (monopost) => {
        setSelectedMonopost(monopost); // Set data to pre-fill
        setModalOpen(true);            // Open modal
    };

    // Handle "Add New" (Reset selected data)
    const handleAddNew = () => {
        setSelectedMonopost(null); // Clear data for new entry
        setModalOpen(true);
    };

    return (
        <div>
            {/* Header with Add Button */}
            <div className="sm:flex sm:items-center justify-between mb-4">
                <div className="sm:flex-auto">
                    <h1 className="text-base font-semibold leading-6 text-gray-900">Setups</h1>
                    <p className="mt-2 text-sm text-gray-700">A list of all car configurations.</p>
                </div>
                <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
                    <button
                        type="button"
                        onClick={handleAddNew}
                        className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                    >
                        Add Setup
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="mt-8 flow-root">
                <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                        <table className="min-w-full divide-y divide-gray-300">
                            <thead>
                                <tr>
                                    <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">Name/Details</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Tires</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Other</th>
                                    <th className="relative py-3.5 pl-3 pr-4 sm:pr-0"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {monoposts.map((car) => (
                                    <tr key={car.id}>
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">{car.details}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{car.tires}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{car.other}</td>
                                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                                            {/* Edit Button */}
                                            <button 
                                                onClick={() => handleEdit(car)}
                                                className="text-indigo-600 hover:text-indigo-900 mr-4"
                                            >
                                                Edit
                                            </button>
                                            {/* Delete Button */}
                                            <button 
                                                onClick={() => handleDelete(car.id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Smart Modal */}
            <AddMonopost 
                open={isModalOpen} 
                setOpen={setModalOpen} 
                initialData={selectedMonopost} 
                onSuccess={fetchMonoposts} // Refresh list after save/update
            />
        </div>
    );
}
