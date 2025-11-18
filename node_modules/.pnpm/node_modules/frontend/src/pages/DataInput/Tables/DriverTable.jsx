import { useEffect, useState } from "react";
import AddNewDriver from "../AddNewDriver";
import { getDrivers } from "../../../api/drivers.routes";

const people = [
    { name: "Lindsay Walton", greutate: "32", other: "lfeaw" },
    { name: "Lindsay Walton", greutate: "55", other: "lfwaefw" },
    { name: "Lindsay Walton", greutate: "66", other: "lfewafawom" },
    { name: "Lindsay Walton", greutate: "77", other: "lindfewafw.com" },
    { name: "Lindsay Walton", greutate: "88", other: "lindsfawefawecom" },
    // More people...
];

export default function DriversTable() {
    const [open, setOpen] = useState(false);
    const [drivers, setDrivers] = useState([]);

    useEffect(() => {
        getDrivers()
            .then((response) => {
                console.log("Drivers fetched successfully:", response.data);
                setDrivers(response.data);
                // Process the response data as needed
            })
            .catch((error) => {
                console.error("Error fetching drivers:", error);
            });
    }, []);
    return (
        <div className="px-4 sm:px-6 lg:px-8">
            <AddNewDriver open={open} setOpen={setOpen} />
            <div className="sm:flex sm:items-center">
                <div className="sm:flex-auto">
                    <h1 className="text-base font-semibold text-gray-900">Drivers</h1>
                    <p className="mt-2 text-sm text-gray-700">
                        A list of all the drivers including their name, weight and other information. You can add, edit
                        or delete drivers as needed.
                    </p>
                </div>
                <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                    <button
                        type="button"
                        className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        onClick={() => setOpen(true)}
                    >
                        Add driver
                    </button>
                </div>
            </div>
            <div className="mt-8 flow-root">
                <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="inline-block min-w-full py-2 align-middle">
                        <table className="min-w-full divide-y divide-gray-300">
                            <thead>
                                <tr>
                                    <th
                                        scope="col"
                                        className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-6 lg:pl-8"
                                    >
                                        Name
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                                    >
                                        Greutate
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                                    >
                                        Other
                                    </th>
                                    <th scope="col" className="relative py-3.5 pr-4 pl-3 sm:pr-6 lg:pr-8">
                                        <span className="sr-only">Edit</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {drivers.map((person, index) => (
                                    <tr key={person.name + index}>
                                        <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 sm:pl-6 lg:pl-8">
                                            {person.name || "-"}
                                        </td>
                                        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                                            {person.weight || "-"}
                                        </td>
                                        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                                            {person.other || "-"}
                                        </td>
                                        <td className="relative py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-6 lg:pr-8">
                                            <a href="#" className="text-indigo-600 hover:text-indigo-900">
                                                Edit<span className="sr-only">, {person.name}</span>
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
