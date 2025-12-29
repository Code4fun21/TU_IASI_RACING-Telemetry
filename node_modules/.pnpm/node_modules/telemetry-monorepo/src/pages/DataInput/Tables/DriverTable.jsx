import { useEffect, useState } from "react";
import AddNewDriver from "../AddNewDriver";
import { api } from "../../../services/api";

export default function DriversTable() {
    const [drivers, setDrivers] = useState([]);
    const [isModalOpen, setModalOpen] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState(null); // Holds data for editing

    const fetchDrivers = () => {
        api.getDrivers()
            .then(res => setDrivers(res || []))
            .catch(err => console.error("Error fetching drivers:", err));
    };

    useEffect(() => {
        fetchDrivers();
    }, []);

    // Handle Delete
    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this driver?")) return;
        
        try {
            await api.deleteDriver(id);
            setDrivers(prev => prev.filter(d => d.id !== id));
        } catch (err) {
            if (err.response && err.response.status === 409) {
                alert("Cannot delete: This driver has recorded sessions.");
            } else {
                console.error("Delete failed:", err);
                alert("Failed to delete.");
            }
        }
    };

    // Handle Edit Click
    const handleEdit = (driver) => {
        setSelectedDriver(driver);
        setModalOpen(true);
    };

    // Handle Add Click
    const handleAddNew = () => {
        setSelectedDriver(null);
        setModalOpen(true);
    };

    return (
        <div>
            <div className="sm:flex sm:items-center justify-between mb-4">
                <div className="sm:flex-auto">
                    <h1 className="text-base font-semibold leading-6 text-gray-900">Drivers</h1>
                    <p className="mt-2 text-sm text-gray-700">A list of all team drivers.</p>
                </div>
                <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
                    <button
                        type="button"
                        onClick={handleAddNew}
                        className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                    >
                        Add Driver
                    </button>
                </div>
            </div>
            
            <div className="mt-8 flow-root">
                <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                        <table className="min-w-full divide-y divide-gray-300">
                            <thead>
                                <tr>
                                    <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">Name</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Weight</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Other</th>
                                    <th className="relative py-3.5 pl-3 pr-4 sm:pr-0"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {drivers.map((person) => (
                                    <tr key={person.id}>
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                                            {person.name || "-"}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {person.weight || "-"}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {person.other || "-"}
                                        </td>
                                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                                            <button 
                                                onClick={() => handleEdit(person)}
                                                className="text-indigo-600 hover:text-indigo-900 mr-4"
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(person.id)}
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
            <AddNewDriver 
                open={isModalOpen} 
                setOpen={setModalOpen} 
                initialData={selectedDriver}
                onSuccess={fetchDrivers}
            />
        </div>
    );
}