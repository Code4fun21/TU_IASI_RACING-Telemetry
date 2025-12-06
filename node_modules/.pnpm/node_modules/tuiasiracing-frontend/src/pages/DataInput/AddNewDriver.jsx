import PropTypes from "prop-types";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { api } from "../../services/api";
import { useEffect, useState } from "react";

export default function AddNewDriver({ open, setOpen, initialData, onSuccess }) {
    
    // 1. Local state for form fields
    const [formData, setFormData] = useState({ name: "", weight: "", other: "" });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 2. Populate form when editing
    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || "",
                weight: initialData.weight || "",
                other: initialData.other || ""
            });
        } else {
            setFormData({ name: "", weight: "", other: "" }); // Reset
        }
    }, [initialData, open]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);

        const rawWeight = event.target["driver-weight"].value;
        const payload = {
            name: event.target["driver-name"].value,
            weight: rawWeight ? parseFloat(rawWeight) : undefined,
            other: event.target["other-information"].value,
        };

        try {
            if (initialData) {
                // EDIT MODE
                await api.updateDriver(initialData.id, payload);
                console.log("Driver updated");
            } else {
                // CREATE MODE
                await api.saveDriver(payload);
                console.log("Driver created");
            }
            
            setOpen(false);
            if (onSuccess) onSuccess(); // Refresh table
        } catch (error) {
            console.error("Error saving driver:", error);
            alert("Failed to save driver.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const isEditMode = !!initialData;

    return (
        <Dialog open={open} onClose={() => !isSubmitting && setOpen(false)} className="relative z-10">
            <div className="fixed inset-0 bg-gray-500/75 transition-opacity" />

            <div className="fixed inset-0 overflow-hidden">
                <div className="absolute inset-0 overflow-hidden">
                    <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
                        <DialogPanel className="pointer-events-auto w-screen max-w-md transform transition bg-white shadow-xl">
                            <form className="flex h-full flex-col divide-y divide-gray-200" onSubmit={handleSubmit}>
                                <div className="h-0 flex-1 overflow-y-auto">
                                    <div className="bg-indigo-700 px-4 py-6 sm:px-6">
                                        <div className="flex items-center justify-between">
                                            <DialogTitle className="text-base font-semibold text-white">
                                                {isEditMode ? "Edit Driver" : "New Driver"}
                                            </DialogTitle>
                                            <button 
                                                type="button" 
                                                onClick={() => setOpen(false)} 
                                                className="text-indigo-200 hover:text-white"
                                                disabled={isSubmitting}
                                            >
                                                <XMarkIcon className="size-6" />
                                            </button>
                                        </div>
                                        <p className="mt-1 text-sm text-indigo-300">
                                            {isEditMode ? "Update driver details." : "Register a new driver."}
                                        </p>
                                    </div>
                                    <div className="space-y-6 px-4 py-6">
                                        
                                        {/* Name */}
                                        <div>
                                            <label htmlFor="driver-name" className="block text-sm font-medium text-gray-900">Name</label>
                                            <input
                                                id="driver-name"
                                                name="driver-name"
                                                type="text"
                                                required
                                                defaultValue={formData.name}
                                                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                            />
                                        </div>

                                        {/* Weight */}
                                        <div>
                                            <label htmlFor="driver-weight" className="block text-sm font-medium text-gray-900">Weight (kg)</label>
                                            <input
                                                id="driver-weight"
                                                name="driver-weight"
                                                type="text"
                                                defaultValue={formData.weight}
                                                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                            />
                                        </div>

                                        {/* Other */}
                                        <div>
                                            <label htmlFor="other-information" className="block text-sm font-medium text-gray-900">Other Info</label>
                                            <textarea
                                                id="other-information"
                                                name="other-information"
                                                rows={3}
                                                defaultValue={formData.other}
                                                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex shrink-0 justify-end px-4 py-4">
                                    <button 
                                        type="button" 
                                        onClick={() => setOpen(false)} 
                                        disabled={isSubmitting}
                                        className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={isSubmitting}
                                        className="ml-4 inline-flex justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting ? "Saving..." : (isEditMode ? "Update" : "Save")}
                                    </button>
                                </div>
                            </form>
                        </DialogPanel>
                    </div>
                </div>
            </div>
        </Dialog>
    );
}

AddNewDriver.propTypes = {
    open: PropTypes.bool.isRequired,
    setOpen: PropTypes.func.isRequired,
    initialData: PropTypes.object,
    onSuccess: PropTypes.func,
};