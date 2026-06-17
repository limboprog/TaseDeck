use tase_deck_lib::{parse_cli_args, run_market_probe, AppResult};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> AppResult<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let options = parse_cli_args(&args)?;
    run_market_probe(options)
}
