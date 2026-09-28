// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MovieTicket.sol";
import "./FilmmakerCampaign.sol";

/**
 * @title Reviews
 * @dev Decentralized, NFT-gated ratings and comments system — CORE PRODUCT FEATURE.
 *
 * Only verified owners (MovieTicket OR FilmmakerCampaign InvestmentNFT via hasCrowdfundAccess)
 * can submit/edit a single review per film. This enforces "your voice is verified because you own it on-chain".
 *
 * LEGAL TIE-IN (Step 3):
 * - Gating relies on the utility NFTs defined in MovieTicket + FilmmakerCampaign.
 * - Section 230 protects the platform for hosting these third-party reviews.
 * - DMCA: Reviews containing infringing material can be delisted via platform action (no on-chain deletion).
 * - All review eligibility is strictly on-chain (no off-chain KYC or custody).
 *
 * See ToS §3 (UGC + Zero-Censorship) and RESEARCH_AND_INTEGRATION.md.
 * All legal text and contract comments require review by licensed counsel before mainnet deployment.
 *
 * Only verified owners can review: holders of a MovieTicket OR crowdfund InvestmentNFT
 * (via FilmmakerCampaign.hasCrowdfundAccess after filmmaker calls setCampaignVideo).
 * This is the core social layer for the platform — verified owner voice only.
 */
contract Reviews {
    struct Review {
        address reviewer;
        uint8 rating;      // 1-5
        string comment;
        uint256 timestamp;
    }

    // videoHash => reviewer => Review  (enforces one review per user per film)
    mapping(string => mapping(address => Review)) private reviews;

    // videoHash => list of reviewers (for enumeration in Phase 0)
    mapping(string => address[]) public reviewersByVideo;

    MovieTicket public immutable movieTicket;
    FilmmakerCampaign public immutable filmmakerCampaign;

    event ReviewSubmitted(
        string indexed videoHash,
        address indexed reviewer,
        uint8 rating,
        string comment,
        uint256 timestamp
    );

    event ReviewUpdated(
        string indexed videoHash,
        address indexed reviewer,
        uint8 rating,
        string comment,
        uint256 timestamp
    );

    constructor(address _movieTicket, address _filmmakerCampaign) {
        movieTicket = MovieTicket(_movieTicket);
        filmmakerCampaign = FilmmakerCampaign(_filmmakerCampaign);
    }

    modifier onlyVerifiedOwner(string memory videoHash) {
        // T16: delisted (illegal) content is immediately non-reviewable
        require(!movieTicket.isFilmDelisted(videoHash), "Film has been delisted for legal reasons");
        bool hasTicket = movieTicket.hasAccessToVideo(msg.sender, videoHash);
        bool hasCrowdfund = address(filmmakerCampaign) != address(0) &&
            filmmakerCampaign.hasCrowdfundAccess(msg.sender, videoHash);
        require(
            hasTicket || hasCrowdfund,
            "Must own a MovieTicket or crowdfund InvestmentNFT for this video to review"
        );
        _;
    }

    function submitReview(
        string memory videoHash,
        uint8 rating,
        string memory comment
    ) external onlyVerifiedOwner(videoHash) {
        require(rating >= 1 && rating <= 5, "Rating must be 1-5");
        require(bytes(comment).length > 0 && bytes(comment).length <= 500, "Comment too long");

        bool isNew = reviews[videoHash][msg.sender].reviewer == address(0);

        if (isNew) {
            reviewersByVideo[videoHash].push(msg.sender);
        }

        reviews[videoHash][msg.sender] = Review({
            reviewer: msg.sender,
            rating: rating,
            comment: comment,
            timestamp: block.timestamp
        });

        if (isNew) {
            emit ReviewSubmitted(videoHash, msg.sender, rating, comment, block.timestamp);
        } else {
            emit ReviewUpdated(videoHash, msg.sender, rating, comment, block.timestamp);
        }
    }

    function getReview(string memory videoHash, address reviewer) external view returns (Review memory) {
        if (movieTicket.isFilmDelisted(videoHash)) {
            return Review({reviewer: address(0), rating: 0, comment: "", timestamp: 0});
        }
        return reviews[videoHash][reviewer];
    }

    function getReviews(string memory videoHash) external view returns (Review[] memory) {
        if (movieTicket.isFilmDelisted(videoHash)) {
            return new Review[](0);
        }
        address[] memory reviewers = reviewersByVideo[videoHash];
        Review[] memory result = new Review[](reviewers.length);

        for (uint256 i = 0; i < reviewers.length; i++) {
            result[i] = reviews[videoHash][reviewers[i]];
        }
        return result;
    }

    function getReviewCount(string memory videoHash) external view returns (uint256) {
        if (movieTicket.isFilmDelisted(videoHash)) {
            return 0;
        }
        return reviewersByVideo[videoHash].length;
    }

    function hasReviewed(string memory videoHash, address reviewer) external view returns (bool) {
        if (movieTicket.isFilmDelisted(videoHash)) {
            return false;
        }
        return reviews[videoHash][reviewer].reviewer != address(0);
    }
}
