import * as echarts from "echarts";

import { useEffect } from "react";
import MapChart from "../../../components/MapChart";
import VitalChart from "./Charts/VitalChart";
import TopActionBar from "../Components/TopActionBar";

export default function LiveAdvanceCharts() {

    const GROUP_ID = "syncGroup";

    useEffect(() => {
        // Connect all charts with the same group
        echarts.connect(GROUP_ID);
        // return () => echarts.disposeConnection("fleet");
    }, []);

    return (
        <>
            <div>
                <TopActionBar />
                <dl className="mt-5 flex flex-row  gap-5 ">
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">Vital Functions</dt>

                        <MapChart data={sampleData} width={800} height={400} group={GROUP_ID} />
                    </div>
                </dl>
                <div className="mx-auto max-w-full py-6 ">
                    <div className="grid grid-cols-1  items-start gap-4 lg:grid-cols-2 xl:grid-cols-4 ">
                        <div className="order-6 col-span-4 grid grid-cols-1 lg:col-span-2">
                            <section aria-labelledby="section-2-title">
                                <h2 id="section-2-title" className="sr-only">
                                    Vital Functions
                                </h2>
                                <div className="overflow-visible rounded-lg bg-white shadow">
                                    <dt className="truncate text-sm font-medium text-gray-500 text-center">
                                        Vital Functions
                                    </dt>
                                    <VitalChart />
                                </div>
                            </section>
                        </div>
                        <div className="order-7 col-span-4 grid grid-cols-1 lg:col-span-2">
                            <section aria-labelledby="section-2-title">
                                <h2 id="section-2-title" className="sr-only">
                                    Section title
                                </h2>
                                <div className="overflow-visible rounded-lg bg-white shadow">
                                    <dt className="truncate text-sm font-medium text-gray-500 text-center">Gearing</dt>
                                    <VitalChart />
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
                <div className="mx-auto max-w-full py-6 ">
                    <div className="grid grid-cols-1  items-start gap-4 lg:grid-cols-2 xl:grid-cols-4 ">
                        <div className="order-6 col-span-4 grid grid-cols-1 lg:col-span-2">
                            <section aria-labelledby="section-2-title">
                                <h2 id="section-2-title" className="sr-only">
                                    Engine Performance
                                </h2>
                                <div className="overflow-visible rounded-lg bg-white shadow">
                                    <dt className="truncate text-sm font-medium text-gray-500 text-center">
                                        Engine Performance
                                    </dt>
                                    <VitalChart />
                                </div>
                            </section>
                        </div>
                        <div className="order-7 col-span-4 grid grid-cols-1 lg:col-span-2">
                            <section aria-labelledby="section-2-title">
                                <h2 id="section-2-title" className="sr-only">
                                    Driver Activity
                                </h2>
                                <div className="overflow-visible rounded-lg bg-white shadow">
                                    <dt className="truncate text-sm font-medium text-gray-500 text-center">
                                        Driver Activity
                                    </dt>
                                    <VitalChart />
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
                <div className="mx-auto max-w-full py-6 ">
                    <div className="grid grid-cols-1  items-start gap-4 lg:grid-cols-2 xl:grid-cols-4 ">
                        <div className="order-6 col-span-4 grid grid-cols-1 lg:col-span-2">
                            <section aria-labelledby="section-2-title">
                                <h2 id="section-2-title" className="sr-only">
                                    G-Force
                                </h2>
                                <div className="overflow-visible rounded-lg bg-white shadow">
                                    <dt className="truncate text-sm font-medium text-gray-500 text-center">G-Force</dt>
                                    <VitalChart />
                                </div>
                            </section>
                        </div>
                        <div className="order-7 col-span-4 grid grid-cols-1 lg:col-span-2">
                            <section aria-labelledby="section-2-title">
                                <h2 id="section-2-title" className="sr-only">
                                    Braking
                                </h2>
                                <div className="overflow-visible rounded-lg bg-white shadow">
                                    <dt className="truncate text-sm font-medium text-gray-500 text-center">Braking</dt>
                                    <VitalChart />
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
                <div className="mx-auto max-w-full py-6 ">
                    <div className="grid grid-cols-1  items-start gap-4 lg:grid-cols-2 xl:grid-cols-4 ">
                        <div className="order-6 col-span-4 grid grid-cols-1 lg:col-span-2">
                            <section aria-labelledby="section-2-title">
                                <h2 id="section-2-title" className="sr-only">
                                    Roll and Pitch Angle
                                </h2>
                                <div className="overflow-visible rounded-lg bg-white shadow">
                                    <dt className="truncate text-sm font-medium text-gray-500 text-center">
                                        Roll and Pitch Angle
                                    </dt>
                                    <VitalChart />
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

const sampleData = [
    [26.94207398, 46.52643458, 180],
    [26.94180435, 46.52640764, 170],
    [26.94153472, 46.52638069, 106],
    [26.94132361, 46.5262441, 43],
    [26.94134956, 46.52597715, 62],
    [26.94140095, 46.52571109, 55],
    [26.94145234, 46.52544503, 58],
    [26.94150373, 46.52517897, 75],
    [26.94168644, 46.52503626, 120],
    [26.94183116, 46.52520274, 71],
    [26.94177809, 46.52546827, 69],
    [26.94172267, 46.52573352, 96],
    [26.94167664, 46.52599957, 55],
    [26.94185747, 46.5261368, 77],
    [26.94208074, 46.52606507, 65],
    [26.94197211, 46.52582961, 56],
    [26.94206511, 46.52558574, 117],
    [26.94229455, 46.52544947, 43],
    [26.94254363, 46.52535126, 82],
    [26.94269306, 46.52512672, 111],
    [26.94260251, 46.52497052, 53],
    [26.94237496, 46.525104, 102],
    [26.9421197, 46.5250598, 97],
    [26.94196775, 46.52486141, 90],
    [26.9416997, 46.52482855, 64],
    [26.94143252, 46.52479332, 73],
    [26.94128917, 46.52459868, 96],
    [26.94130862, 46.52432841, 42],
    [26.94132806, 46.52405815, 93],
    [26.94144042, 46.52386588, 79],
    [26.94165676, 46.52393611, 50],
    [26.94179158, 46.5239891, 65],
    [26.94186998, 46.52387751, 64],
    [26.94191286, 46.52374839, 107],
    [26.9420118, 46.52366189, 99],
    [26.94216064, 46.52370255, 92],
    [26.94214793, 46.52394913, 77],
    [26.94209251, 46.52417766, 91],
    [26.94184013, 46.52428137, 106],
    [26.94168799, 46.52443823, 88],
    [26.94177362, 46.52457135, 107],
    [26.94214979, 46.52464247, 82],
    [26.94258626, 46.52470866, 93],
    [26.94291695, 46.52477053, 81],
    [26.94309684, 46.52494657, 104],
    [26.94295158, 46.52524165, 104],
    [26.94270977, 46.52562038, 107],
    [26.94243157, 46.52607885, 67],
    [26.94219955, 46.5262962, 96],
    [26.94207065, 46.52640425, 111],
    [26.94206356, 46.52643461, 73],
];
