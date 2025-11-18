import PropTypes from "prop-types";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { createDriver } from "../../api/drivers.routes";

export default function AddNewDriver({ open, setOpen }) {
    const handleSubmit = (event) => {
        const obj = {
            name: event.target["driver-name"].value,
            weight: event.target["driver-weight"].value,
            otherInformation: event.target["other-information"].value,
        };
        console.log("Form submitted with values:", obj);
        createDriver({
            name: event.target["driver-name"].value,
            weight: event.target["driver-weight"].value,
            other: event.target["other-information"].value,
        })
            .then((response) => {
                console.log("Driver created successfully:", response.data);
                setOpen(false);
            })
            .catch((error) => {
                console.error("Error creating driver:", error);
            });
        event.preventDefault(); // Prevent the default form submission
    };

    return (
        <Dialog open={open} onClose={setOpen} className="relative z-10">
            <div className="fixed inset-0" />

            <div className="fixed inset-0 overflow-hidden">
                <div className="absolute inset-0 overflow-hidden">
                    <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
                        <DialogPanel
                            transition
                            className="pointer-events-auto w-screen max-w-md transform transition duration-500 ease-in-out data-closed:translate-x-full sm:duration-700"
                        >
                            <form
                                className="flex h-full flex-col divide-y divide-gray-200 bg-white shadow-xl"
                                onSubmit={handleSubmit}
                            >
                                <div className="h-0 flex-1 overflow-y-auto">
                                    <div className="bg-indigo-700 px-4 py-6 sm:px-6">
                                        <div className="flex items-center justify-between">
                                            <DialogTitle className="text-base font-semibold text-white">
                                                New Driver
                                            </DialogTitle>
                                            <div className="ml-3 flex h-7 items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => setOpen(false)}
                                                    className="relative rounded-md bg-indigo-700 text-indigo-200 hover:text-white focus:ring-2 focus:ring-white focus:outline-hidden"
                                                >
                                                    <span className="absolute -inset-2.5" />
                                                    <span className="sr-only">Close panel</span>
                                                    <XMarkIcon aria-hidden="true" className="size-6" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mt-1">
                                            <p className="text-sm text-indigo-300">
                                                Get started by filling in the information below to create a new driver.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-1 flex-col justify-between ">
                                        <div className="divide-y divide-gray-200 px-4 sm:px-6">
                                            <div className="space-y-6 pt-6 pb-5">
                                                <div>
                                                    <label
                                                        htmlFor="driver-name"
                                                        className="block text-sm/6 font-medium text-gray-900"
                                                    >
                                                        Driver name
                                                    </label>
                                                    <div className="mt-2">
                                                        <input
                                                            id="driver-name"
                                                            name="driver-name"
                                                            type="text"
                                                            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label
                                                        htmlFor="driver-weight"
                                                        className="block text-sm/6 font-medium text-gray-900"
                                                    >
                                                        Driver weight
                                                    </label>
                                                    <div className="mt-2">
                                                        <input
                                                            id="driver-weight"
                                                            name="driver-weight"
                                                            type="text"
                                                            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label
                                                        htmlFor="other-information"
                                                        className="block text-sm/6 font-medium text-gray-900"
                                                    >
                                                        Other information
                                                    </label>
                                                    <div className="mt-2">
                                                        <textarea
                                                            id="other-information"
                                                            name="other-information "
                                                            rows={3}
                                                            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                                            defaultValue={""}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <div aria-hidden="true" className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-gray-300" />
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 justify-end px-4 py-4">
                                        <button
                                            type="button"
                                            onClick={() => setOpen(false)}
                                            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="ml-4 inline-flex justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                                        >
                                            Save
                                        </button>
                                    </div>
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
};
