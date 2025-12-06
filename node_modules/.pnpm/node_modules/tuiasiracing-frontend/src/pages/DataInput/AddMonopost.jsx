import PropTypes from "prop-types";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { api } from "../../services/api";
import { useEffect, useState } from "react";



export default function AddMonopost({ open, setOpen, initialData, onSuccess }) {
    
    // Local state to handle form fields
    const [formData, setFormData] = useState({ tires: "", details: "", other: "" });

    // When modal opens or initialData changes, update form
    useEffect(() => {
        if (initialData) {
            setFormData({
                tires: initialData.tires || "",
                details: initialData.details || "",
                other: initialData.other || ""
            });
        } else {
            setFormData({ tires: "", details: "", other: "" }); // Reset for "Add New"
        }
    }, [initialData, open]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        
        const payload = {
            tires: event.target["tires"].value,
            details: event.target["details"].value,
            other: event.target["other-information"].value,
        };

        try {
            if (initialData) {
                // EDIT MODE
                await api.updateMonopost(initialData.id, payload);
                console.log("Monopost updated");
            } else {
                // CREATE MODE
                await api.saveMonoposts(payload);
                console.log("Monopost created");
            }
            
            setOpen(false);
            if (onSuccess) onSuccess(); // Refresh table
        } catch (error) {
            console.error("Error saving monopost:", error);
            alert("Failed to save.");
        }
    };

    const isEditMode = !!initialData;

    return (
        <Dialog open={open} onClose={() => setOpen(false)} className="relative z-10">
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
                                                {isEditMode ? "Edit Monopost" : "New Monopost"}
                                            </DialogTitle>
                                            <button type="button" onClick={() => setOpen(false)} className="text-indigo-200 hover:text-white">
                                                <XMarkIcon className="size-6" />
                                            </button>
                                        </div>
                                        <p className="mt-1 text-sm text-indigo-300">
                                            {isEditMode ? "Update configuration details." : "Create a new monopost configuration."}
                                        </p>
                                    </div>
                                    <div className="space-y-6 px-4 py-6">
                                        
                                        {/* Name / Details */}
                                        <div>
                                            <label htmlFor="details" className="block text-sm font-medium text-gray-900">Name/Details</label>
                                            <input
                                                id="details"
                                                name="details"
                                                type="text"
                                                required
                                                defaultValue={formData.details} 
                                                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                            />
                                        </div>

                                        {/* Tires */}
                                        <div>
                                            <label htmlFor="tires" className="block text-sm font-medium text-gray-900">Tires</label>
                                            <input
                                                id="tires"
                                                name="tires"
                                                type="text"
                                                defaultValue={formData.tires} 
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
                                    <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Cancel</button>
                                    <button type="submit" className="ml-4 inline-flex justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">{isEditMode ? "Update" : "Save"}</button>
                                </div>
                            </form>
                        </DialogPanel>
                    </div>
                </div>
            </div>
        </Dialog>
    );
}

AddMonopost.propTypes = {
    open: PropTypes.bool.isRequired,
    setOpen: PropTypes.func.isRequired,
    initialData: PropTypes.object,
    onSuccess: PropTypes.func,
};