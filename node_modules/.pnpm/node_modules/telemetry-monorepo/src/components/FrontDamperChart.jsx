import PropTypes from "prop-types";
import ChartWrapper from "../ChartWrapper"; // Adjust the import path if necessary

const FrontDamperChart = ({ leftData, rightData, width = 200, height = 200 }) => {
    const options = {
        grid: {
            left: "3%",
            right: "4%",
            containLabel: true,
            top: "5%", // Increase the top margin
            // bottom: "20%", // Adjust the bottom margin
            height: 200,
            width: 120
        },
        xAxis: {
            type: "category",
            data: ["Left", "Right"],
        },
        yAxis: {
            type: "value",
        },
        series: [
            {
                data: [leftData, rightData],
                type: "bar",
                barWidth: 30,
                showBackground: true,
                backgroundStyle: {
                    color: "rgba(180, 180, 180, 0.2)",
                },
            },
        ],
    };
    return (
        <div style={{ width, height }}>
            <ChartWrapper options={options} style={{ width: "100%", height: "100%" }} />
        </div>
    );
};
FrontDamperChart.propTypes = {
    leftData: PropTypes.number.isRequired, // Adjusted to accept a single number
    rightData: PropTypes.number.isRequired, // Adjusted to accept a single number
    width: PropTypes.number, // Width of the chart
    height: PropTypes.number, // Height of the chart
};
// RPMChart.propTypes = {
//     data: PropTypes.arrayOf(
//         PropTypes.shape({
//             value: PropTypes.number.isRequired,
//             name: PropTypes.string.isRequired,
//         })
//     ).isRequired,
// };

export default FrontDamperChart;
