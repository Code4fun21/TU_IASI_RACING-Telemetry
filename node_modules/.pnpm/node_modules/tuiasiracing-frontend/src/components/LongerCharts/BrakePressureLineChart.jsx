import PropTypes from "prop-types";
import ChartWrapper from "../../ChartWrapper"; // Adjust the import path if necessary

const BrakePressureLineChart = ({ dateList, valueList, width = 200, height = 200, group }) => {
    const options = {
        visualMap: [
            {
                show: false,
                type: "continuous",
                seriesIndex: 0,
                min: 0,
                max: 400,
            },
        ],
        tooltip: {
            trigger: "axis",
        },
        xAxis: [
            {
                data: dateList,
            },
        ],
        yAxis: [
            {},
        ],
        grid: [
            {
                bottom: "40%",
                height: 150,
            },
        ],
        series: [
            {
                type: "line",
                showSymbol: false,
                data: valueList,
            },
        ],
    };
    return (
        <div style={{ width, height }}>
            <ChartWrapper group={group} options={options} style={{ width: "100%", height: "100%" }} />
        </div>
    );
};
BrakePressureLineChart.propTypes = {
    dateList: PropTypes.arrayOf(PropTypes.string).isRequired, // Array of date strings
    valueList: PropTypes.arrayOf(PropTypes.number).isRequired, // Array of values
    width: PropTypes.number, // Width of the chart
    height: PropTypes.number, // Height of the chart
    group: PropTypes.string, // Optional group identifier
};
// RPMChart.propTypes = {
//     data: PropTypes.arrayOf(
//         PropTypes.shape({
//             value: PropTypes.number.isRequired,
//             name: PropTypes.string.isRequired,
//         })
//     ).isRequired,
// };

export default BrakePressureLineChart;
