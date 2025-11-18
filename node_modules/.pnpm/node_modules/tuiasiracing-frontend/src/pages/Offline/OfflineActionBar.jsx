import { EllipsisVerticalIcon } from "@heroicons/react/20/solid";
import { GiFullMotorcycleHelmet } from "react-icons/gi";
import { MdCarRepair } from "react-icons/md";
import { TbRoad } from "react-icons/tb";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { BsFillRecordCircleFill } from "react-icons/bs";
import DriverSelect from "../MQTT/Components/DriverSelect";
import MonopostSelect from "../MQTT/Components/MonopostSelect";

const projects = [
    { name: "Track", initials: "T", selected: "Bacau", bgColor: "bg-yellow-500" },
    { name: "Start", initials: "RC", selected: 8, bgColor: "bg-green-500" },
];

function classNames(...classes) {
    return classes.filter(Boolean).join(" ");
}

export default function OfflineActionBar() {
    return (
        <div>
            <h2 className="text-sm font-medium text-gray-500">Session Settings</h2>
            <ul role="list" className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
                <li key={"Driver"} className="col-span-1 flex rounded-md shadow-xs overflow-visible">
                    <div
                        className={classNames(
                            "bg-pink-600",
                            "flex w-16 shrink-0 items-center justify-center rounded-l-md text-sm font-medium text-white"
                        )}
                    >
                        <GiFullMotorcycleHelmet size={40} />
                    </div>
                    <div className=" overflow-visible flex flex-1 items-center justify-between truncate rounded-r-md border-t border-r border-b border-gray-200 bg-white">
                        <div className="flex-1 truncate px-4 py-2 text-sm overflow-visible">
                            <DriverSelect />
                        </div>
                    </div>
                </li>
                <li key={"monopost"} className="col-span-1 flex rounded-md shadow-xs overflow-visible">
                    <div
                        className={classNames(
                            "bg-purple-600",
                            "flex w-16 shrink-0 items-center justify-center rounded-l-md text-sm font-medium text-white"
                        )}
                    >
                        <MdCarRepair size={40} />
                    </div>
                    <div className="overflow-visible flex flex-1 items-center justify-between truncate rounded-r-md border-t border-r border-b border-gray-200 bg-white">
                        <div className="flex-1 truncate px-4 py-2 text-sm overflow-visible">
                            <MonopostSelect />
                        </div>
                    </div>
                </li>
                <li key={"race track"} className="col-span-1 flex rounded-md shadow-xs overflow-visible">
                    <div
                        className={classNames(
                            "bg-yellow-500",
                            "flex w-16 shrink-0 items-center justify-center rounded-l-md text-sm font-medium text-white"
                        )}
                    >
                        <TbRoad size={30} />
                    </div>
                    <div className="overflow-visible flex flex-1 items-center justify-between truncate rounded-r-md border-t border-r border-b border-gray-200 bg-white">
                        <div className="flex-1 truncate px-4 py-2 text-sm overflow-visible">
                            <MonopostSelect />
                        </div>
                    </div>
                </li>
                <li key={"recording"} className="col-span-1 flex rounded-md shadow-xs">
                    <div
                        className={classNames(
                            "bg-green-500",
                            "flex w-16 shrink-0 items-center justify-center rounded-l-md text-sm font-medium text-white"
                        )}
                    >
                        <BsFillRecordCircleFill size={30}/>
                    </div>
                    <div className="flex flex-1 items-center justify-between truncate rounded-r-md border-t border-r border-b border-gray-200 bg-white">
                        <div className="flex-1 truncate px-4 py-2 text-sm">
                            <a className="font-medium text-gray-900 hover:text-gray-600">
                                 Record
                            </a>
                            <p className="text-gray-500">test</p>
                        </div>
                        <div className="shrink-0 pr-2">
                            <button
                                type="button"
                                className="inline-flex size-8 items-center justify-center rounded-full  bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden"
                            >
                                <span className="sr-only">Open options</span>
                                <EllipsisVerticalIcon aria-hidden="true" className="size-5" />
                            </button>
                        </div>
                    </div>
                </li>
              
            </ul>
        </div>
    );
}

export function DriverDropdown() {
    return (
        <Menu as="div" className="relative inline-block text-left">
            <div>
                <MenuButton className="inline-flex size-8 items-center justify-center rounded-full  bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden">
                    <EllipsisVerticalIcon aria-hidden="true" className="size-5" />
                </MenuButton>
            </div>

            <MenuItems
                transition
                className="absolute right-0 z-10 mt-2 w-56 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black/5 transition focus:outline-hidden data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
            >
                <div className="py-1">
                    <MenuItem>
                        <a
                            href="#"
                            className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden"
                        >
                            Add Driver
                        </a>
                    </MenuItem>
                    <MenuItem>
                        <a
                            href="#"
                            className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden"
                        >
                            Edit Driver
                        </a>
                    </MenuItem>
                </div>

                <div className="py-1">
                    <MenuItem>
                        <a
                            href="#"
                            className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden"
                        >
                            Delete Driver
                        </a>
                    </MenuItem>
                </div>
            </MenuItems>
        </Menu>
    );
}
